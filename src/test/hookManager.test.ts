import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  EVENT_FILENAME,
  getCodexCatHookSignature,
  getHookPaths,
  HOOK_FILENAME,
  installCodexCatHooks,
  isCodexCatHookCurrent,
  uninstallCodexCatHooks
} from '../hookManager';

type JsonObject = Record<string, unknown>;

suite('Codex Cat hook manager', () => {
  let homeDirectory: string;
  let sourceHookPath: string;

  setup(() => {
    homeDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'codex-cat-hook-manager-')
    );
    sourceHookPath = path.join(homeDirectory, 'source-hook.cjs');
    fs.copyFileSync(getBundledHookPath(), sourceHookPath);
  });

  teardown(() => {
    fs.rmSync(homeDirectory, { recursive: true, force: true });
  });

  test('installs hooks without replacing existing settings', () => {
    const paths = getHookPaths(homeDirectory);
    fs.mkdirSync(paths.codexDirectory, { recursive: true });
    fs.writeFileSync(
      paths.hooksConfigPath,
      JSON.stringify({
        customSetting: true,
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash',
              hooks: [{ type: 'command', command: 'check-bash' }]
            },
            {
              hooks: [
                {
                  type: 'command',
                  command: `node ${paths.installedHookPath}`
                }
              ]
            }
          ],
          Stop: [
            {
              hooks: [{ type: 'command', command: 'keep-stop-hook' }]
            }
          ]
        }
      }),
      'utf8'
    );

    const result = installCodexCatHooks({
      sourceHookPath,
      runtimeExecutable: '/Applications/Visual Studio Code.app/Code Helper',
      homeDirectory,
      platform: 'darwin'
    });

    const config = readJson(paths.hooksConfigPath);
    const hooks = config.hooks as JsonObject;

    assert.strictEqual(config.customSetting, true);
    assert.strictEqual(
      JSON.stringify(hooks.PreToolUse),
      JSON.stringify([
        {
          matcher: 'Bash',
          hooks: [{ type: 'command', command: 'check-bash' }]
        }
      ])
    );
    assert.strictEqual(countCatHandlers(hooks.UserPromptSubmit), 1);
    assert.strictEqual(countCatHandlers(hooks.Stop), 1);
    assert.strictEqual(countCommands(hooks.Stop, 'keep-stop-hook'), 1);
    assert.ok(getCodexCatHookSignature(homeDirectory));
    assert.strictEqual(
      isCodexCatHookCurrent(sourceHookPath, homeDirectory),
      true
    );
    assert.ok(result.backupPath);
    assert.ok(fs.existsSync(result.backupPath));
    assert.ok(fs.existsSync(paths.installedHookPath));

    const command = firstCatCommand(hooks.UserPromptSubmit);
    assert.ok(command.includes('CODEX_CAT_HOOK=1'));
    assert.ok(command.includes('CODEX_CAT_HOOK_VERSION='));
    assert.ok(command.includes('ELECTRON_RUN_AS_NODE=1'));
    assert.ok(command.includes("'\/Applications\/Visual Studio Code.app\/Code Helper'"));
    assert.ok(command.includes(paths.installedHookPath));

    fs.appendFileSync(paths.installedHookPath, '\n// stale copy\n', 'utf8');
    assert.strictEqual(
      isCodexCatHookCurrent(sourceHookPath, homeDirectory),
      false
    );

    fs.unlinkSync(paths.installedHookPath);
    assert.strictEqual(getCodexCatHookSignature(homeDirectory), undefined);
    assert.strictEqual(
      isCodexCatHookCurrent(sourceHookPath, homeDirectory),
      false
    );
  });

  test('does not overwrite malformed hooks.json', () => {
    const paths = getHookPaths(homeDirectory);
    fs.mkdirSync(paths.codexDirectory, { recursive: true });
    fs.writeFileSync(paths.hooksConfigPath, '{ broken', 'utf8');

    assert.throws(() => {
      installCodexCatHooks({
        sourceHookPath,
        runtimeExecutable: process.execPath,
        homeDirectory
      });
    });

    assert.strictEqual(
      fs.readFileSync(paths.hooksConfigPath, 'utf8'),
      '{ broken'
    );
    assert.strictEqual(fs.existsSync(paths.installedHookPath), false);
  });

  test('uninstalls only Codex Cat handlers', () => {
    const paths = getHookPaths(homeDirectory);
    fs.mkdirSync(paths.codexDirectory, { recursive: true });
    fs.writeFileSync(
      paths.hooksConfigPath,
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            {
              hooks: [{ type: 'command', command: 'keep-prompt-hook' }]
            }
          ]
        }
      }),
      'utf8'
    );

    installCodexCatHooks({
      sourceHookPath,
      runtimeExecutable: process.execPath,
      homeDirectory
    });
    fs.writeFileSync(
      path.join(paths.installDirectory, EVENT_FILENAME),
      '{"type":"Stop"}\n',
      'utf8'
    );
    const result = uninstallCodexCatHooks(homeDirectory);
    const hooks = readJson(paths.hooksConfigPath).hooks as JsonObject;

    assert.strictEqual(result.removedHandlers, 2);
    assert.strictEqual(result.removedHookScript, true);
    assert.strictEqual(result.removedEventFile, true);
    assert.strictEqual(result.removedInstallDirectory, true);
    assert.ok(result.backupPath);
    assert.strictEqual(countCatHandlers(hooks.UserPromptSubmit), 0);
    assert.strictEqual(countCatHandlers(hooks.Stop), 0);
    assert.strictEqual(
      countCommands(hooks.UserPromptSubmit, 'keep-prompt-hook'),
      1
    );
    assert.strictEqual(fs.existsSync(paths.installedHookPath), false);
    assert.strictEqual(fs.existsSync(paths.installDirectory), false);
  });

  test('installed command runs with the VS Code executable as Node', () => {
    const paths = getHookPaths(homeDirectory);
    installCodexCatHooks({
      sourceHookPath,
      runtimeExecutable: process.execPath,
      homeDirectory,
      platform: process.platform
    });

    const hooks = readJson(paths.hooksConfigPath).hooks as JsonObject;
    const command = firstCatCommand(hooks.UserPromptSubmit);
    const hookResult = spawnSync(command, {
      shell: true,
      input: JSON.stringify({
        hook_event_name: 'UserPromptSubmit',
        session_id: 'session-test',
        turn_id: 'turn-test',
        prompt: 'must not be stored'
      }),
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: homeDirectory,
        USERPROFILE: homeDirectory
      }
    });

    assert.strictEqual(hookResult.status, 0, hookResult.stderr);
    assert.strictEqual(hookResult.stdout, '{}');

    const eventFile = path.join(homeDirectory, '.codex-cat', 'events.jsonl');
    const eventText = fs.readFileSync(eventFile, 'utf8');
    const event = JSON.parse(eventText.trim()) as JsonObject;

    assert.strictEqual(event.type, 'UserPromptSubmit');
    assert.strictEqual(event.sessionId, 'session-test');
    assert.strictEqual(event.turnId, 'turn-test');
    assert.strictEqual(event.prompt, undefined);

    if (process.platform !== 'win32') {
      assert.strictEqual(fs.statSync(eventFile).mode & 0o777, 0o600);
    }
  });

  test('creates a marked Windows command override', () => {
    const paths = getHookPaths(homeDirectory);
    installCodexCatHooks({
      sourceHookPath,
      runtimeExecutable: 'C:\\Program Files\\Microsoft VS Code\\Code.exe',
      homeDirectory,
      platform: 'win32'
    });

    const hooks = readJson(paths.hooksConfigPath).hooks as JsonObject;
    const handler = firstCatHandler(hooks.UserPromptSubmit);

    assert.strictEqual(handler.command, handler.commandWindows);
    assert.ok(String(handler.command).includes('set "CODEX_CAT_HOOK=1"'));
    assert.ok(
      String(handler.command).includes('set "ELECTRON_RUN_AS_NODE=1"')
    );
    assert.ok(
      String(handler.command).includes(
        '"C:\\Program Files\\Microsoft VS Code\\Code.exe"'
      )
    );
  });

  test('caps the local event log before appending a new event', () => {
    const eventDirectory = path.join(homeDirectory, '.codex-cat');
    const eventFile = path.join(eventDirectory, 'events.jsonl');
    fs.mkdirSync(eventDirectory, { recursive: true });
    fs.writeFileSync(eventFile, Buffer.alloc(1024 * 1024, 0x20));

    const hookResult = spawnSync(process.execPath, [getBundledHookPath()], {
      input: JSON.stringify({
        hook_event_name: 'Stop',
        session_id: 'session-test',
        turn_id: 'turn-test'
      }),
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: homeDirectory,
        USERPROFILE: homeDirectory
      }
    });

    assert.strictEqual(hookResult.status, 0, hookResult.stderr);
    assert.strictEqual(hookResult.stdout, '{}');
    assert.ok(fs.statSync(eventFile).size < 1024 * 1024);

    const event = JSON.parse(fs.readFileSync(eventFile, 'utf8')) as JsonObject;
    assert.strictEqual(event.type, 'Stop');
    assert.strictEqual(event.turnId, 'turn-test');
  });
});

function getBundledHookPath(): string {
  return path.join(__dirname, '..', '..', 'scripts', HOOK_FILENAME);
}

function readJson(filePath: string): JsonObject {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as JsonObject;
}

function countCatHandlers(value: unknown): number {
  return getCommands(value).filter((command) => command.includes(HOOK_FILENAME))
    .length;
}

function countCommands(value: unknown, expectedCommand: string): number {
  return getCommands(value).filter((command) => command === expectedCommand)
    .length;
}

function firstCatCommand(value: unknown): string {
  const command = getCommands(value).find((candidate) =>
    candidate.includes(HOOK_FILENAME)
  );

  assert.ok(command);
  return command;
}

function firstCatHandler(value: unknown): JsonObject {
  if (!Array.isArray(value)) {
    assert.fail('expected hook matcher groups');
  }

  for (const group of value) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      continue;
    }

    const handler = group.hooks.find(
      (candidate: unknown) =>
        isRecord(candidate) &&
        typeof candidate.command === 'string' &&
        candidate.command.includes('CODEX_CAT_HOOK=1')
    );

    if (isRecord(handler)) {
      return handler;
    }
  }

  assert.fail('expected a Codex Cat hook handler');
}

function getCommands(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((group: unknown) => {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      return [];
    }

    return group.hooks.flatMap((handler: unknown) => {
      if (!isRecord(handler) || typeof handler.command !== 'string') {
        return [];
      }

      return [handler.command];
    });
  });
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
