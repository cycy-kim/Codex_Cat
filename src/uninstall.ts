import { uninstallCodexCatHooks } from './hookManager';

try {
  uninstallCodexCatHooks();
} catch (error) {
  console.error('Codex Cat: uninstall cleanup failed', error);
  process.exitCode = 1;
}
