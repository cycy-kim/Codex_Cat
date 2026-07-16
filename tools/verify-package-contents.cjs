'use strict';

const path = require('node:path');
const { listFiles } = require('@vscode/vsce');

const projectRoot = path.resolve(__dirname, '..');
const requiredFiles = [
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'dist/extension.js',
  'dist/uninstall.js',
  'icon.png',
  'media/codex-cat-frames.woff',
  'package.json',
  'scripts/codex-cat-hook.cjs'
];

async function main() {
  const packagedFiles = (await listFiles({ cwd: projectRoot }))
    .map((file) => file.replaceAll('\\', '/'))
    .sort();
  const packagedFileSet = new Set(packagedFiles);
  const missingFiles = requiredFiles.filter(
    (file) => !packagedFileSet.has(file)
  );
  const unexpectedFiles = packagedFiles.filter(
    (file) => !requiredFiles.includes(file)
  );

  if (missingFiles.length > 0 || unexpectedFiles.length > 0) {
    if (missingFiles.length > 0) {
      console.error(`Missing package files: ${missingFiles.join(', ')}`);
    }

    if (unexpectedFiles.length > 0) {
      console.error(`Unexpected package files: ${unexpectedFiles.join(', ')}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log(`Verified ${packagedFiles.length} VSIX files:`);
  for (const file of packagedFiles) {
    console.log(file);
  }
}

main().catch((error) => {
  console.error('Could not verify VSIX contents.');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
