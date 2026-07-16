import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  getCodexCatHookSignature,
  HOOK_FILENAME,
  installCodexCatHooks,
  isCodexCatHookCurrent,
  uninstallCodexCatHooks
} from './hookManager';
import {
  IDLE_CAT_FRAME,
  RUNNING_CAT_FRAME_DURATIONS_MS,
  RUNNING_CAT_FRAMES
} from './catFrames';
import {
  haveBothHookEventTypesBeenObserved,
  type CodexHookEvent,
  parseHookEvent,
  updateActiveTurnIds,
  updateObservedHookEventTypes
} from './hookEvents';
import {
  getIdleStatusPresentation,
  resolvePostInstallTransition,
  resolveSetupState,
  type SetupAction,
  type SetupState
} from './setupState';

const EVENT_DIRECTORY = path.join(os.homedir(), '.codex-cat');
const EVENT_FILE = path.join(EVENT_DIRECTORY, 'events.jsonl');

const FILE_WATCH_INTERVAL_MS = 200;
// Keep the original storage key so existing working installations retain
// their evidence across extension updates.
const LAST_WORKING_HOOK_SIGNATURE_KEY = 'codexCat.verifiedHookSignature';
const HOOK_REVIEW_OPEN_KEY = 'codexCat.hookReviewOpen';

const INSTALL_HOOKS_COMMAND = 'codexCat.installHooks';
const REINSTALL_HOOKS_COMMAND = 'codexCat.reinstallHooks';
const UNINSTALL_HOOKS_COMMAND = 'codexCat.uninstallHooks';
const REVIEW_HOOKS_COMMAND = 'codexCat.reviewHooks';
const RETURN_TO_CODEX_COMMAND = 'codexCat.returnToCodex';
const CODEX_EXTENSION_ID = 'openai.chatgpt';
const CODEX_HOOKS_SETTINGS_PATH = '/settings/hooks-settings';
const CODEX_NEW_CHAT_COMMAND = 'chatgpt.newChat';
const REVIEW_HOOKS_ACTION = 'Review Hooks';

const SETUP_ACTION_COMMANDS: Record<SetupAction, string> = {
  install: INSTALL_HOOKS_COMMAND,
  reinstall: REINSTALL_HOOKS_COMMAND,
  review: REVIEW_HOOKS_COMMAND
};

let extensionContext: vscode.ExtensionContext | undefined;
let statusBarItem: vscode.StatusBarItem;
let returnToCodexStatusBarItem: vscode.StatusBarItem;
let animationTimer: NodeJS.Timeout | undefined;
let frameIndex = 0;

let eventFileOffset = 0;
let incompleteLine = '';

let setupState: SetupState = 'notInstalled';
let hookReviewOpen = false;

let activeTurnIds = new Set<string>();
let observedHookEventTypes = new Set<CodexHookEvent['type']>();

export function activate(context: vscode.ExtensionContext): void {
  extensionContext = context;
  setupState = detectSetupState(context);
  hookReviewOpen = context.globalState.get<boolean>(HOOK_REVIEW_OPEN_KEY) === true;

  statusBarItem = vscode.window.createStatusBarItem(
    'codexCat.status',
    vscode.StatusBarAlignment.Right,
    100
  );

  statusBarItem.name = 'Codex Cat';
  renderIdleState();
  statusBarItem.show();

  returnToCodexStatusBarItem = vscode.window.createStatusBarItem(
    'codexCat.returnToCodexStatus',
    vscode.StatusBarAlignment.Right,
    101
  );
  returnToCodexStatusBarItem.name = 'Back to Codex';
  returnToCodexStatusBarItem.text = '$(arrow-left) Back to Codex';
  returnToCodexStatusBarItem.tooltip = 'Open a new Codex task';
  returnToCodexStatusBarItem.command = RETURN_TO_CODEX_COMMAND;
  returnToCodexStatusBarItem.backgroundColor = new vscode.ThemeColor(
    'statusBarItem.warningBackground'
  );
  updateReturnToCodexStatusBarItem();

  const installHooksCommand = vscode.commands.registerCommand(
    INSTALL_HOOKS_COMMAND,
    () => installHooksFromExtension(context, false)
  );

  const reinstallHooksCommand = vscode.commands.registerCommand(
    REINSTALL_HOOKS_COMMAND,
    () => installHooksFromExtension(context, true)
  );

  const uninstallHooksCommand = vscode.commands.registerCommand(
    UNINSTALL_HOOKS_COMMAND,
    () => uninstallHooksFromExtension(context)
  );

  const reviewHooksCommand = vscode.commands.registerCommand(
    REVIEW_HOOKS_COMMAND,
    () => showHookReviewPrompt()
  );

  const returnToCodexCommand = vscode.commands.registerCommand(
    RETURN_TO_CODEX_COMMAND,
    () => returnToCodex()
  );

  context.subscriptions.push(
    statusBarItem,
    returnToCodexStatusBarItem,
    installHooksCommand,
    reinstallHooksCommand,
    uninstallHooksCommand,
    reviewHooksCommand,
    returnToCodexCommand
  );

  const watcher = initializeEventWatcher();
  if (watcher) {
    context.subscriptions.push(watcher);
  }
}

export function deactivate(): void {
  activeTurnIds.clear();
  observedHookEventTypes.clear();
  stopAnimation();
  extensionContext = undefined;
}

function detectSetupState(context: vscode.ExtensionContext): SetupState {
  try {
    const installedSignature = getCodexCatHookSignature();

    if (!installedSignature) {
      return 'notInstalled';
    }

    if (!isCodexCatHookCurrent(getBundledHookPath(context))) {
      return 'updateRequired';
    }

    return resolveSetupState({
      installedSignature,
      hookIsCurrent: true,
      lastWorkingSignature: context.globalState.get<string>(
        LAST_WORKING_HOOK_SIGNATURE_KEY
      )
    });
  } catch (error) {
    console.error('Codex Cat: failed to inspect hooks.json', error);
    return 'configurationError';
  }
}

async function installHooksFromExtension(
  context: vscode.ExtensionContext,
  reinstall: boolean
): Promise<void> {
  if (!reinstall) {
    try {
      if (getCodexCatHookSignature()) {
        const action = await vscode.window.showInformationMessage(
          'Codex Cat is already set up.',
          REVIEW_HOOKS_ACTION,
          'Reinstall'
        );

        if (action === REVIEW_HOOKS_ACTION) {
          await openCodexHooksSettings();
        } else if (action === 'Reinstall') {
          await installHooksFromExtension(context, true);
        }

        return;
      }
    } catch (error) {
      showSetupError('Couldn\'t check Codex Cat setup.', error);
      return;
    }
  }

  const confirmationAction = reinstall ? 'Reinstall' : 'Set Up';
  const confirmation = await vscode.window.showInformationMessage(
    reinstall ? 'Reinstall Codex Cat hooks?' : 'Set up Codex Cat?',
    {
      modal: true,
      detail: reinstall
        ? 'Your other Codex hooks and settings won\'t be changed.'
        : 'Adds two hooks that detect when Codex starts and stops. Prompt content is never stored.'
    },
    confirmationAction
  );

  if (confirmation !== confirmationAction) {
    return;
  }

  try {
    const lastWorkingSignature = context.globalState.get<string>(
      LAST_WORKING_HOOK_SIGNATURE_KEY
    );
    installCodexCatHooks({
      sourceHookPath: getBundledHookPath(context),
      runtimeExecutable: process.execPath
    });
    const installedSignature = getCodexCatHookSignature();

    if (!installedSignature) {
      throw new Error('Installed hook definitions could not be verified.');
    }

    const transition = resolvePostInstallTransition(
      installedSignature,
      lastWorkingSignature
    );

    if (transition.clearWorkingEvidence) {
      await context.globalState.update(
        LAST_WORKING_HOOK_SIGNATURE_KEY,
        undefined
      );
    }

    setupState = transition.state;
    await setHookReviewOpen(false);
    activeTurnIds.clear();
    observedHookEventTypes.clear();
    stopAnimation();

    if (!transition.showReviewPrompt) {
      void vscode.window.showInformationMessage(
        'Codex Cat hooks reinstalled.'
      );
    } else {
      await showHookReviewPrompt();
    }
  } catch (error) {
    setupState = 'configurationError';
    renderIdleState();
    showSetupError('Couldn\'t set up Codex Cat.', error);
  }
}

async function uninstallHooksFromExtension(
  context: vscode.ExtensionContext
): Promise<void> {
  const confirmation = await vscode.window.showWarningMessage(
    'Remove Codex Cat hooks?',
    {
      modal: true,
      detail: 'Your other Codex hooks and settings won\'t be changed.'
    },
    'Remove'
  );

  if (confirmation !== 'Remove') {
    return;
  }

  try {
    uninstallCodexCatHooks();

    await context.globalState.update(
      LAST_WORKING_HOOK_SIGNATURE_KEY,
      undefined
    );
    setupState = 'notInstalled';
    await setHookReviewOpen(false);
    activeTurnIds.clear();
    observedHookEventTypes.clear();
    stopAnimation();

    void vscode.window.showInformationMessage('Codex Cat hooks removed.');
  } catch (error) {
    showSetupError('Couldn\'t remove Codex Cat hooks.', error);
  }
}

async function showHookReviewPrompt(): Promise<void> {
  const action = await vscode.window.showInformationMessage(
    'Review both Codex Cat hooks, then reload hooks.',
    REVIEW_HOOKS_ACTION
  );

  if (action === REVIEW_HOOKS_ACTION) {
    await openCodexHooksSettings();
  }
}

async function openCodexHooksSettings(): Promise<void> {
  // Keep the public sidebar command as a baseline in case Codex changes its
  // internal settings route in a future release.
  const sidebarOpened = await openCodexSidebar();

  try {
    const hooksSettingsUri = vscode.Uri.from({
      scheme: vscode.env.uriScheme,
      authority: CODEX_EXTENSION_ID,
      path: CODEX_HOOKS_SETTINGS_PATH
    });

    if (await vscode.env.openExternal(hooksSettingsUri)) {
      await setHookReviewOpen(true);
      return;
    }
  } catch (error) {
    console.error('Codex Cat: could not open the Codex Hooks settings', error);
  }

  void vscode.window.showWarningMessage(
    sidebarOpened
      ? 'Open Codex Settings → Hooks to finish setup.'
      : 'Open Codex, then go to Settings → Hooks.'
  );
}

async function returnToCodex(): Promise<void> {
  try {
    await vscode.commands.executeCommand(CODEX_NEW_CHAT_COMMAND);
    await setHookReviewOpen(false);
  } catch (error) {
    console.error('Codex Cat: could not return to Codex', error);
    void vscode.window.showWarningMessage(
      'Couldn\'t open Codex. Run “Codex: New Task in ChatGPT Sidebar” from the Command Palette.'
    );
  }
}

async function openCodexSidebar(): Promise<boolean> {
  try {
    await vscode.commands.executeCommand('chatgpt.openSidebar');
    return true;
  } catch (error) {
    console.error('Codex Cat: could not open the Codex sidebar', error);
    return false;
  }
}

function showSetupError(message: string, error: unknown): void {
  console.error(message, error);
  void vscode.window.showErrorMessage(message);
}

function initializeEventWatcher(): vscode.Disposable | undefined {
  try {
    ensurePrivateEventDirectory();
    ensureEventFileExists();

    // Ignore events recorded before this activation.
    const eventFileDescriptor = openEventFileForRead();

    try {
      if (process.platform !== 'win32') {
        fs.fchmodSync(eventFileDescriptor, 0o600);
      }

      eventFileOffset = fs.fstatSync(eventFileDescriptor).size;
    } finally {
      fs.closeSync(eventFileDescriptor);
    }

    incompleteLine = '';

    const eventFileListener = (current: fs.Stats, previous: fs.Stats): void => {
      if (current.nlink === 0) {
        resetEventReadState();
        return;
      }

      if (current.size < eventFileOffset || current.ino !== previous.ino) {
        resetEventReadState();
      }

      readNewHookEvents();
    };

    fs.watchFile(
      EVENT_FILE,
      { interval: FILE_WATCH_INTERVAL_MS },
      eventFileListener
    );

    return {
      dispose: () => {
        fs.unwatchFile(EVENT_FILE, eventFileListener);
        clearAnimationTimer();
      }
    };
  } catch (error) {
    console.error('Codex Cat: failed to initialize event file watcher', error);
    return undefined;
  }
}

function resetEventReadState(): void {
  eventFileOffset = 0;
  incompleteLine = '';
}

function readNewHookEvents(): void {
  try {
    const fileDescriptor = openEventFileForRead();
    let buffer: Buffer;
    let bytesRead = 0;

    try {
      const fileStats = fs.fstatSync(fileDescriptor);

      // Read a recreated or truncated file from the beginning.
      if (fileStats.size < eventFileOffset) {
        resetEventReadState();
      }

      if (fileStats.size === eventFileOffset) {
        return;
      }

      const bytesToRead = fileStats.size - eventFileOffset;
      buffer = Buffer.allocUnsafe(bytesToRead);
      bytesRead = fs.readSync(
        fileDescriptor,
        buffer,
        0,
        bytesToRead,
        eventFileOffset
      );
      if (bytesRead === 0) {
        return;
      }

      eventFileOffset += bytesRead;

      const newText =
        incompleteLine + buffer.subarray(0, bytesRead).toString('utf8');
      const lines = newText.split(/\r?\n/);

      // Keep a possibly incomplete final JSON line until the next read.
      incompleteLine = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        const event = parseHookEvent(line);
        if (event) {
          handleHookEvent(event);
        }
      }
    } finally {
      fs.closeSync(fileDescriptor);
    }
  } catch (error) {
    console.error('Codex Cat: failed to read event file', error);
  }
}

function ensurePrivateEventDirectory(): void {
  let stats = lstatIfPresent(EVENT_DIRECTORY);

  if (!stats) {
    try {
      fs.mkdirSync(EVENT_DIRECTORY, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }

    stats = fs.lstatSync(EVENT_DIRECTORY);
  }

  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error('Codex Cat data path is not a real directory');
  }

  if (process.platform !== 'win32') {
    const directoryDescriptor = fs.openSync(
      EVENT_DIRECTORY,
      fs.constants.O_RDONLY |
        (fs.constants.O_DIRECTORY ?? 0) |
        noFollowFlag()
    );

    try {
      if (!fs.fstatSync(directoryDescriptor).isDirectory()) {
        throw new Error('Codex Cat data path is not a real directory');
      }

      fs.fchmodSync(directoryDescriptor, 0o700);
    } finally {
      fs.closeSync(directoryDescriptor);
    }
  }
}

function ensureEventFileExists(): void {
  const existing = lstatIfPresent(EVENT_FILE);

  if (!existing) {
    let fileDescriptor: number | undefined;

    try {
      fileDescriptor = fs.openSync(
        EVENT_FILE,
        fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          fs.constants.O_WRONLY |
          noFollowFlag(),
        0o600
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    } finally {
      if (fileDescriptor !== undefined) {
        fs.closeSync(fileDescriptor);
      }
    }
  }

  const current = fs.lstatSync(EVENT_FILE);

  if (current.isSymbolicLink() || !current.isFile()) {
    throw new Error('Codex Cat event path is not a regular file');
  }
}

function openEventFileForRead(): number {
  const existing = lstatIfPresent(EVENT_FILE);

  if (!existing || existing.isSymbolicLink() || !existing.isFile()) {
    throw new Error('Codex Cat event path is not a regular file');
  }

  const fileDescriptor = fs.openSync(
    EVENT_FILE,
    fs.constants.O_RDONLY | noFollowFlag()
  );

  if (!fs.fstatSync(fileDescriptor).isFile()) {
    fs.closeSync(fileDescriptor);
    throw new Error('Codex Cat event path is not a regular file');
  }

  return fileDescriptor;
}

function noFollowFlag(): number {
  return process.platform === 'win32'
    ? 0
    : (fs.constants.O_NOFOLLOW ?? 0);
}

function lstatIfPresent(filePath: string): fs.Stats | undefined {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}

function handleHookEvent(event: CodexHookEvent): void {
  if (event.type === 'UserPromptSubmit') {
    void setHookReviewOpen(false);
  }

  observedHookEventTypes = updateObservedHookEventTypes(
    observedHookEventTypes,
    event
  );

  if (haveBothHookEventTypesBeenObserved(observedHookEventTypes)) {
    recordWorkingHookSignature();
  }

  activeTurnIds = updateActiveTurnIds(activeTurnIds, event);

  updateAnimationState();
}

function recordWorkingHookSignature(): void {
  try {
    if (
      !extensionContext ||
      !isCodexCatHookCurrent(getBundledHookPath(extensionContext))
    ) {
      return;
    }

    const signature = getCodexCatHookSignature();

    if (!signature) {
      return;
    }

    setupState = 'workingObserved';
    void extensionContext?.globalState.update(
      LAST_WORKING_HOOK_SIGNATURE_KEY,
      signature
    ).then(undefined, (error: unknown) => {
      console.error('Codex Cat: failed to save working hook state', error);
    });
  } catch (error) {
    console.error('Codex Cat: failed to verify installed hooks', error);
  }
}

function updateAnimationState(): void {
  const shouldAnimate = activeTurnIds.size > 0;

  if (shouldAnimate) {
    startAnimation();
  } else {
    stopAnimation();
  }
}

function startAnimation(): void {
  if (animationTimer) {
    return;
  }

  statusBarItem.command = undefined;
  statusBarItem.tooltip = 'Codex is working';
  frameIndex = 0;
  statusBarItem.text = RUNNING_CAT_FRAMES[frameIndex];

  scheduleNextAnimationFrame();
}

function scheduleNextAnimationFrame(): void {
  animationTimer = setTimeout(() => {
    frameIndex = (frameIndex + 1) % RUNNING_CAT_FRAMES.length;
    statusBarItem.text = RUNNING_CAT_FRAMES[frameIndex];
    scheduleNextAnimationFrame();
  }, RUNNING_CAT_FRAME_DURATIONS_MS[frameIndex]);
}

function stopAnimation(): void {
  clearAnimationTimer();
  renderIdleState();
}

function renderIdleState(): void {
  if (!statusBarItem) {
    return;
  }

  const presentation = getIdleStatusPresentation(setupState);
  statusBarItem.text = presentation.suffix
    ? `${IDLE_CAT_FRAME} ${presentation.suffix}`
    : IDLE_CAT_FRAME;
  statusBarItem.tooltip = presentation.tooltip;
  statusBarItem.command = presentation.action
    ? SETUP_ACTION_COMMANDS[presentation.action]
    : undefined;
}

async function setHookReviewOpen(open: boolean): Promise<void> {
  const changed = hookReviewOpen !== open;
  hookReviewOpen = open;
  updateReturnToCodexStatusBarItem();

  if (!changed || !extensionContext) {
    return;
  }

  try {
    await extensionContext.globalState.update(
      HOOK_REVIEW_OPEN_KEY,
      open ? true : undefined
    );
  } catch (error) {
    console.error('Codex Cat: failed to save Hooks navigation state', error);
  }
}

function updateReturnToCodexStatusBarItem(): void {
  if (!returnToCodexStatusBarItem) {
    return;
  }

  if (hookReviewOpen) {
    returnToCodexStatusBarItem.show();
  } else {
    returnToCodexStatusBarItem.hide();
  }
}

function clearAnimationTimer(): void {
  if (animationTimer) {
    clearTimeout(animationTimer);
    animationTimer = undefined;
  }
}

function getBundledHookPath(context: vscode.ExtensionContext): string {
  return context.asAbsolutePath(path.join('scripts', HOOK_FILENAME));
}
