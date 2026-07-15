import { uninstallCodexCatHooks } from './hookManager';

try {
  const result = uninstallCodexCatHooks();
  console.log('Codex Cat: uninstall cleanup completed', result);
} catch (error) {
  console.error('Codex Cat: uninstall cleanup failed', error);
  process.exitCode = 1;
}
