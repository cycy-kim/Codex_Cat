import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';

export const HOOK_FILENAME = 'codex-cat-hook.cjs';
export const EVENT_FILENAME = 'events.jsonl';

type JsonObject = Record<string, unknown>;

type HookPaths = {
  installDirectory: string;
  installedHookPath: string;
  codexDirectory: string;
  hooksConfigPath: string;
};

export type HookInstallOptions = {
  sourceHookPath: string;
  runtimeExecutable?: string;
  homeDirectory?: string;
  platform?: NodeJS.Platform;
};

export type HookInstallResult = HookPaths & {
  backupPath?: string;
};

export type HookUninstallResult = HookPaths & {
  backupPath?: string;
  removedHandlers: number;
  removedHookScript: boolean;
  removedEventFile: boolean;
  removedInstallDirectory: boolean;
};

type ExistingConfig = {
  config: JsonObject;
  existed: boolean;
};

export function getHookPaths(
  homeDirectory: string = os.homedir()
): HookPaths {
  const installDirectory = path.join(homeDirectory, '.codex-cat');
  const codexDirectory = path.join(homeDirectory, '.codex');

  return {
    installDirectory,
    installedHookPath: path.join(installDirectory, HOOK_FILENAME),
    codexDirectory,
    hooksConfigPath: path.join(codexDirectory, 'hooks.json')
  };
}

export function getCodexCatHookSignature(
  homeDirectory: string = os.homedir()
): string | undefined {
  const { hooksConfigPath, installedHookPath } = getHookPaths(homeDirectory);

  if (
    !requireRegularFileIfPresent(hooksConfigPath, 'Codex hooks config') ||
    !requireRegularFileIfPresent(installedHookPath, 'Codex Cat hook script')
  ) {
    return undefined;
  }

  const { config } = readExistingConfig(hooksConfigPath);
  const hooks = config.hooks;

  if (!isRecord(hooks)) {
    return undefined;
  }

  const eventHandlers = ['UserPromptSubmit', 'Stop'].map((eventName) =>
    findCodexCatHandlers(hooks[eventName], installedHookPath)
  );

  if (eventHandlers.some((handlers) => handlers.length === 0)) {
    return undefined;
  }

  return JSON.stringify(eventHandlers);
}

export function isCodexCatHookCurrent(
  sourceHookPath: string,
  homeDirectory: string = os.homedir()
): boolean {
  const { hooksConfigPath, installedHookPath } = getHookPaths(homeDirectory);

  if (
    !fs.existsSync(sourceHookPath) ||
    !requireRegularFileIfPresent(
      installedHookPath,
      'Codex Cat hook script'
    ) ||
    !requireRegularFileIfPresent(hooksConfigPath, 'Codex hooks config')
  ) {
    return false;
  }

  const sourceHook = fs.readFileSync(sourceHookPath);
  const installedHook = fs.readFileSync(installedHookPath);

  if (!sourceHook.equals(installedHook)) {
    return false;
  }

  const versionMarker = createHookVersionMarker(sourceHook);
  const { config } = readExistingConfig(hooksConfigPath);
  const hooks = config.hooks;

  if (!isRecord(hooks)) {
    return false;
  }

  return ['UserPromptSubmit', 'Stop'].every((eventName) =>
    findCodexCatHandlers(hooks[eventName], installedHookPath).some((handler) =>
      handlerCommands(handler).some((command) =>
        command.includes(versionMarker)
      )
    )
  );
}

export function installCodexCatHooks(
  options: HookInstallOptions
): HookInstallResult {
  const homeDirectory = options.homeDirectory ?? os.homedir();
  const runtimeExecutable = options.runtimeExecutable ?? process.execPath;
  const platform = options.platform ?? process.platform;
  const paths = getHookPaths(homeDirectory);

  if (!fs.existsSync(options.sourceHookPath)) {
    throw new Error(`Bundled hook script is missing: ${options.sourceHookPath}`);
  }

  const existing = readExistingConfig(paths.hooksConfigPath);
  const hooks = cloneHooks(existing.config.hooks);
  removeCodexCatHandlers(hooks, paths.installedHookPath);

  const sourceHook = fs.readFileSync(options.sourceHookPath);
  const hookVersionMarker = createHookVersionMarker(sourceHook);

  const handler = createHookHandler(
    runtimeExecutable,
    paths.installedHookPath,
    platform,
    hookVersionMarker
  );

  addCodexCatHook(hooks, 'UserPromptSubmit', handler);
  addCodexCatHook(hooks, 'Stop', handler);

  const nextConfig: JsonObject = {
    ...existing.config,
    hooks
  };

  ensurePrivateDirectory(paths.installDirectory, 'Codex Cat data directory');
  fs.mkdirSync(paths.codexDirectory, { recursive: true });
  requireRegularFileIfPresent(
    paths.installedHookPath,
    'Codex Cat hook script'
  );

  const backupPath = existing.existed
    ? createBackup(paths.hooksConfigPath)
    : undefined;

  const previousHook = fs.existsSync(paths.installedHookPath)
    ? fs.readFileSync(paths.installedHookPath)
    : undefined;

  try {
    writeFileAtomically(paths.installedHookPath, sourceHook);
    writeConfig(paths.hooksConfigPath, nextConfig);
  } catch (error) {
    if (previousHook) {
      writeFileAtomically(paths.installedHookPath, previousHook);
    } else {
      fs.rmSync(paths.installedHookPath, { force: true });
    }

    throw error;
  }

  return { ...paths, backupPath };
}

export function uninstallCodexCatHooks(
  homeDirectory: string = os.homedir()
): HookUninstallResult {
  const paths = getHookPaths(homeDirectory);
  requireDirectoryIfPresent(
    paths.installDirectory,
    'Codex Cat data directory'
  );
  requireRegularFileIfPresent(
    paths.installedHookPath,
    'Codex Cat hook script'
  );
  const eventFilePath = path.join(paths.installDirectory, EVENT_FILENAME);
  requireRegularFileIfPresent(eventFilePath, 'Codex Cat event file');

  const existing = readExistingConfig(paths.hooksConfigPath);
  const hooks = cloneHooks(existing.config.hooks);
  const removedHandlers = removeCodexCatHandlers(
    hooks,
    paths.installedHookPath
  );
  let backupPath: string | undefined;

  if (existing.existed && removedHandlers > 0) {
    backupPath = createBackup(paths.hooksConfigPath);
    writeConfig(paths.hooksConfigPath, {
      ...existing.config,
      hooks
    });
  }

  let removedHookScript = false;
  if (fs.existsSync(paths.installedHookPath)) {
    fs.unlinkSync(paths.installedHookPath);
    removedHookScript = true;
  }

  let removedEventFile = false;
  if (fs.existsSync(eventFilePath)) {
    fs.unlinkSync(eventFilePath);
    removedEventFile = true;
  }

  let removedInstallDirectory = false;
  if (
    fs.existsSync(paths.installDirectory) &&
    fs.readdirSync(paths.installDirectory).length === 0
  ) {
    fs.rmdirSync(paths.installDirectory);
    removedInstallDirectory = true;
  }

  return {
    ...paths,
    backupPath,
    removedHandlers,
    removedHookScript,
    removedEventFile,
    removedInstallDirectory
  };
}

function readExistingConfig(hooksConfigPath: string): ExistingConfig {
  if (
    !requireRegularFileIfPresent(
      hooksConfigPath,
      'Codex hooks config'
    )
  ) {
    return { config: {}, existed: false };
  }

  const rawConfig = fs.readFileSync(hooksConfigPath, 'utf8');
  const config: unknown = JSON.parse(rawConfig);

  if (!isRecord(config)) {
    throw new Error('hooks.json must contain a JSON object at the top level');
  }

  if (config.hooks !== undefined && !isRecord(config.hooks)) {
    throw new Error('hooks.json "hooks" must be a JSON object');
  }

  return { config, existed: true };
}

function cloneHooks(value: unknown): JsonObject {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error('hooks.json "hooks" must be a JSON object');
  }

  return { ...value };
}

function createHookHandler(
  runtimeExecutable: string,
  installedHookPath: string,
  platform: NodeJS.Platform,
  hookVersionMarker: string
): JsonObject {
  const command = createHookCommand(
    runtimeExecutable,
    installedHookPath,
    platform,
    hookVersionMarker
  );
  const handler: JsonObject = {
    type: 'command',
    command,
    timeout: 5
  };

  if (platform === 'win32') {
    handler.commandWindows = command;
  }

  return handler;
}

function createHookCommand(
  runtimeExecutable: string,
  installedHookPath: string,
  platform: NodeJS.Platform,
  hookVersionMarker: string
): string {
  if (platform === 'win32') {
    return 'set "CODEX_CAT_HOOK=1" && ' +
      `set "${hookVersionMarker}" && ` +
      'set "ELECTRON_RUN_AS_NODE=1" && ' +
      `${quoteWindows(runtimeExecutable)} ${quoteWindows(installedHookPath)}`;
  }

  return `CODEX_CAT_HOOK=1 ${hookVersionMarker} ELECTRON_RUN_AS_NODE=1 ` +
    `${quotePosix(runtimeExecutable)} ${quotePosix(installedHookPath)}`;
}

function createHookVersionMarker(sourceHook: Buffer): string {
  const digest = crypto.createHash('sha256').update(sourceHook).digest('hex');
  return `CODEX_CAT_HOOK_VERSION=${digest}`;
}

function quotePosix(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function quoteWindows(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

function addCodexCatHook(
  hooks: JsonObject,
  eventName: 'UserPromptSubmit' | 'Stop',
  handler: JsonObject
): void {
  const matcherGroups = hooks[eventName];

  if (matcherGroups !== undefined && !Array.isArray(matcherGroups)) {
    throw new Error(`hooks.${eventName} must be an array`);
  }

  hooks[eventName] = [
    ...(matcherGroups ?? []),
    {
      hooks: [handler]
    }
  ];
}

function removeCodexCatHandlers(
  hooks: JsonObject,
  installedHookPath: string
): number {
  let removedHandlers = 0;

  for (const [eventName, matcherGroups] of Object.entries(hooks)) {
    if (!Array.isArray(matcherGroups)) {
      continue;
    }

    hooks[eventName] = matcherGroups.flatMap((group: unknown) => {
      if (!isRecord(group) || !Array.isArray(group.hooks)) {
        return [group];
      }

      const remainingHandlers = group.hooks.filter((handler: unknown) => {
        if (isCodexCatHandler(handler, installedHookPath)) {
          removedHandlers += 1;
          return false;
        }

        return true;
      });

      if (remainingHandlers.length === 0) {
        return [];
      }

      return [{ ...group, hooks: remainingHandlers }];
    });
  }

  return removedHandlers;
}

function findCodexCatHandlers(
  value: unknown,
  installedHookPath: string
): JsonObject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((group: unknown) => {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      return [];
    }

    return group.hooks.filter(
      (handler: unknown): handler is JsonObject =>
        isCodexCatHandler(handler, installedHookPath)
    );
  });
}

function isCodexCatHandler(
  value: unknown,
  installedHookPath: string
): value is JsonObject {
  if (!isRecord(value)) {
    return false;
  }

  return handlerCommands(value).some(
    (command) =>
      command.includes('CODEX_CAT_HOOK=1') ||
      command.includes(installedHookPath)
  );
}

function handlerCommands(handler: JsonObject): string[] {
  return [handler.command, handler.commandWindows].filter(
    (command): command is string => typeof command === 'string'
  );
}

function createBackup(hooksConfigPath: string): string {
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const backupPath =
    `${hooksConfigPath}.codex-cat-backup-${timestamp}-` + crypto.randomUUID();
  let backupCreated = false;

  try {
    fs.copyFileSync(
      hooksConfigPath,
      backupPath,
      fs.constants.COPYFILE_EXCL
    );
    backupCreated = true;

    if (process.platform !== 'win32') {
      fs.chmodSync(backupPath, 0o600);
    }

    return backupPath;
  } catch (error) {
    if (backupCreated) {
      fs.rmSync(backupPath, { force: true });
    }

    throw error;
  }
}

function writeConfig(hooksConfigPath: string, config: JsonObject): void {
  writeFileAtomically(
    hooksConfigPath,
    `${JSON.stringify(config, null, 2)}\n`
  );
}

function writeFileAtomically(filePath: string, content: string | Buffer): void {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`
  );
  let fileDescriptor: number | undefined;

  try {
    fileDescriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(fileDescriptor, content);
    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = undefined;
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    if (fileDescriptor !== undefined) {
      fs.closeSync(fileDescriptor);
    }

    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}

function ensurePrivateDirectory(
  directoryPath: string,
  description: string
): void {
  const existing = lstatIfPresent(directoryPath);

  if (!existing) {
    fs.mkdirSync(directoryPath, { mode: 0o700 });
  }

  requireDirectoryIfPresent(directoryPath, description);

  if (process.platform !== 'win32') {
    const directoryDescriptor = fs.openSync(
      directoryPath,
      fs.constants.O_RDONLY |
        (fs.constants.O_DIRECTORY ?? 0) |
        (fs.constants.O_NOFOLLOW ?? 0)
    );

    try {
      if (!fs.fstatSync(directoryDescriptor).isDirectory()) {
        throw new Error(`${description} must be a real directory`);
      }

      fs.fchmodSync(directoryDescriptor, 0o700);
    } finally {
      fs.closeSync(directoryDescriptor);
    }
  }
}

function requireDirectoryIfPresent(
  directoryPath: string,
  description: string
): boolean {
  const stats = lstatIfPresent(directoryPath);

  if (!stats) {
    return false;
  }

  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${description} must be a real directory`);
  }

  return true;
}

function requireRegularFileIfPresent(
  filePath: string,
  description: string
): boolean {
  const stats = lstatIfPresent(filePath);

  if (!stats) {
    return false;
  }

  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`${description} must be a regular file`);
  }

  return true;
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

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
