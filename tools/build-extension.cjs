'use strict';

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const projectRoot = path.resolve(__dirname, '..');
const outputDirectory = path.join(projectRoot, 'dist');
const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

const buildOptions = {
  absWorkingDir: projectRoot,
  entryPoints: {
    extension: 'src/extension.ts',
    uninstall: 'src/uninstall.ts'
  },
  bundle: true,
  external: ['vscode'],
  format: 'cjs',
  logLevel: 'info',
  minify: production,
  outdir: outputDirectory,
  platform: 'node',
  sourcemap: !production,
  target: 'node20'
};

async function main() {
  fs.rmSync(outputDirectory, { recursive: true, force: true });

  if (watch) {
    const context = await esbuild.context(buildOptions);
    await context.watch();
    console.log('Watching extension sources...');
    return;
  }

  await esbuild.build(buildOptions);
}

main().catch((error) => {
  console.error('Codex Cat extension build failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
