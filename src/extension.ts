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

const INSTALL_HOOKS_COMMAND = 'codexCat.installHooks';
const REINSTALL_HOOKS_COMMAND = 'codexCat.reinstallHooks';
const UNINSTALL_HOOKS_COMMAND = 'codexCat.uninstallHooks';
const REVIEW_HOOKS_COMMAND = 'codexCat.reviewHooks';
const CODEX_EXTENSION_ID = 'openai.chatgpt';
const CODEX_HOOKS_SETTINGS_PATH = '/settings/hooks-settings';
const REVIEW_HOOKS_ACTION = 'Review Hooks';

const SETUP_ACTION_COMMANDS: Record<SetupAction, string> = {
  install: INSTALL_HOOKS_COMMAND,
  reinstall: REINSTALL_HOOKS_COMMAND,
  review: REVIEW_HOOKS_COMMAND
};

let extensionContext: vscode.ExtensionContext | undefined;
let statusBarItem: vscode.StatusBarItem;
let animationTimer: NodeJS.Timeout | undefined;
let frameIndex = 0;

let eventFileOffset = 0;
let incompleteLine = '';

let setupState: SetupState = 'notInstalled';
let manualTestRunning = false;

let activeTurnIds = new Set<string>();
let observedHookEventTypes = new Set<CodexHookEvent['type']>();

export function activate(context: vscode.ExtensionContext): void {
  extensionContext = context;
  setupState = detectSetupState(context);

  statusBarItem = vscode.window.createStatusBarItem(
    'codexCat.status',
    vscode.StatusBarAlignment.Right,
    100
  );

  statusBarItem.name = 'Codex Cat';
  renderIdleState();
  statusBarItem.show();

  const startTestCommand = vscode.commands.registerCommand(
    'codexCat.testStart',
    () => {
      manualTestRunning = true;
      updateAnimationState();
    }
  );

  const stopTestCommand = vscode.commands.registerCommand(
    'codexCat.testStop',
    () => {
      manualTestRunning = false;
      updateAnimationState();
    }
  );

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

  context.subscriptions.push(
    statusBarItem,
    startTestCommand,
    stopTestCommand,
    installHooksCommand,
    reinstallHooksCommand,
    uninstallHooksCommand,
    reviewHooksCommand
  );

  const watcher = initializeEventWatcher();
  if (watcher) {
    context.subscriptions.push(watcher);
  }
}

export function deactivate(): void {
  manualTestRunning = false;
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
          'Codex Cat hooks are already installed.',
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
      showSetupError('Could not inspect the existing Codex hooks.', error);
      return;
    }
  }

  const confirmation = await vscode.window.showInformationMessage(
    reinstall
      ? 'Reinstall the Codex Cat hooks? Existing Codex hooks will be preserved.'
      : 'Install two Codex Cat hooks? Only event IDs and timestamps are stored; prompt content is never saved.',
    { modal: true },
    reinstall ? 'Reinstall' : 'Install'
  );

  if (confirmation !== (reinstall ? 'Reinstall' : 'Install')) {
    return;
  }

  try {
    const lastWorkingSignature = context.globalState.get<string>(
      LAST_WORKING_HOOK_SIGNATURE_KEY
    );
    const result = installCodexCatHooks({
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
    manualTestRunning = false;
    activeTurnIds.clear();
    observedHookEventTypes.clear();
    stopAnimation();

    console.log('Codex Cat: hooks installed', result);
    if (!transition.showReviewPrompt) {
      void vscode.window.showInformationMessage(
        'Codex Cat hooks were reinstalled without changing their definition.'
      );
    } else {
      await showHookReviewPrompt();
    }
  } catch (error) {
    setupState = 'configurationError';
    renderIdleState();
    showSetupError('Codex Cat could not install its hooks.', error);
  }
}

async function uninstallHooksFromExtension(
  context: vscode.ExtensionContext
): Promise<void> {
  const confirmation = await vscode.window.showWarningMessage(
    'Remove the Codex Cat hooks? Other Codex hooks and settings will be preserved.',
    { modal: true },
    'Uninstall Hooks'
  );

  if (confirmation !== 'Uninstall Hooks') {
    return;
  }

  try {
    const result = uninstallCodexCatHooks();

    await context.globalState.update(
      LAST_WORKING_HOOK_SIGNATURE_KEY,
      undefined
    );
    setupState = 'notInstalled';
    manualTestRunning = false;
    activeTurnIds.clear();
    observedHookEventTypes.clear();
    stopAnimation();

    console.log('Codex Cat: hooks uninstalled', result);
    void vscode.window.showInformationMessage(
      'Codex Cat hooks were removed. Other Codex hooks were preserved.'
    );
  } catch (error) {
    showSetupError('Codex Cat could not remove its hooks.', error);
  }
}

async function showHookReviewPrompt(): Promise<void> {
  const action = await vscode.window.showInformationMessage(
    'Review UserPromptSubmit and Stop. Trust them if prompted, then select Reload hooks.',
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
      return;
    }
  } catch (error) {
    console.error('Codex Cat: could not open the Codex Hooks settings', error);
  }

  void vscode.window.showWarningMessage(
    sidebarOpened
      ? 'Open Codex Settings → Hooks, review both hooks, then reload hooks.'
      : 'Open Codex manually → Settings → Hooks, review both hooks, then reload.'
  );
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
  const detail = error instanceof Error ? error.message : String(error);
  console.error(message, error);
  void vscode.window.showErrorMessage(`${message} ${detail}`);
}

function initializeEventWatcher(): vscode.Disposable | undefined {
  try {
    fs.mkdirSync(EVENT_DIRECTORY, { recursive: true, mode: 0o700 });

    if (process.platform !== 'win32') {
      fs.chmodSync(EVENT_DIRECTORY, 0o700);
    }

    if (!fs.existsSync(EVENT_FILE)) {
      fs.writeFileSync(EVENT_FILE, '', { encoding: 'utf8', mode: 0o600 });
    } else if (process.platform !== 'win32') {
      fs.chmodSync(EVENT_FILE, 0o600);
    }

    // Ignore events recorded before this activation.
    eventFileOffset = fs.statSync(EVENT_FILE).size;
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
    const fileStats = fs.statSync(EVENT_FILE);

    // Read a recreated or truncated file from the beginning.
    if (fileStats.size < eventFileOffset) {
      resetEventReadState();
    }

    if (fileStats.size === eventFileOffset) {
      return;
    }

    const bytesToRead = fileStats.size - eventFileOffset;
    const buffer = Buffer.allocUnsafe(bytesToRead);
    const fileDescriptor = fs.openSync(EVENT_FILE, 'r');
    let bytesRead = 0;

    try {
      bytesRead = fs.readSync(
        fileDescriptor,
        buffer,
        0,
        bytesToRead,
        eventFileOffset
      );
    } finally {
      fs.closeSync(fileDescriptor);
    }

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
  } catch (error) {
    console.error('Codex Cat: failed to read event file', error);
  }
}

function handleHookEvent(event: CodexHookEvent): void {
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
  const shouldAnimate = manualTestRunning || activeTurnIds.size > 0;

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
  statusBarItem.tooltip = 'Codex Cat: Codex is working';
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

function clearAnimationTimer(): void {
  if (animationTimer) {
    clearTimeout(animationTimer);
    animationTimer = undefined;
  }
}

function getBundledHookPath(context: vscode.ExtensionContext): string {
  return context.asAbsolutePath(path.join('scripts', HOOK_FILENAME));
}
