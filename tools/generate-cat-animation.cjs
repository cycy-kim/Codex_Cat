'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  FontAssetType,
  OtherAssetType,
  generateFonts
} = require('fantasticon');
const { Preset, vectorizeRawSync } = require('@neplex/vectorizer');
const { Resvg } = require('@resvg/resvg-js');

const projectRoot = path.resolve(__dirname, '..');
const animationSourcesDirectory = path.join(projectRoot, 'animation-sources');
const animationConfigPath = path.join(projectRoot, 'cat-animation.json');
const packageJsonPath = path.join(projectRoot, 'package.json');
const generatedSourcePath = path.join(projectRoot, 'src', 'catFrames.ts');
const mediaDirectory = path.join(projectRoot, 'media');
const stagingDirectory = path.join(
  projectRoot,
  '.generated',
  'cat-animation'
);

const FONT_NAME = 'codex-cat-frames';
const FONT_PATH = './media/codex-cat-frames.woff';
const FIRST_CODEPOINT = 0xE001;
const LAST_PRIVATE_USE_CODEPOINT = 0xF8FF;
const DEFAULT_FRAME_DURATION_MS = 100;
const STROKE_TRACE_WIDTH = 1024;

async function main() {
  const animationConfig = readJson(animationConfigPath);
  const framesRoot = resolveFramesRoot(animationConfig.framesRoot);
  const sequence = readSequence(framesRoot);
  const availableFrames = discoverSvgFrames(framesRoot);
  const frameFiles = resolveFrameOrder(sequence, availableFrames);
  const frameDurations = resolveFrameDurations(sequence, frameFiles.length);

  if (FIRST_CODEPOINT + frameFiles.length - 1 > LAST_PRIVATE_USE_CODEPOINT) {
    throw new Error('The animation contains too many frames for an icon font');
  }

  fs.rmSync(stagingDirectory, { recursive: true, force: true });
  fs.mkdirSync(stagingDirectory, { recursive: true });
  fs.mkdirSync(mediaDirectory, { recursive: true });

  const codepoints = {};
  const preparedFrames = new Map();
  let outlinedFrameCount = 0;

  for (const [index, frameFile] of frameFiles.entries()) {
    const stagedFrameFile = `codex-cat-frame-${formatFrameNumber(
      index + 1
    )}.svg`;
    const iconSourceId = path.basename(stagedFrameFile, '.svg');
    codepoints[iconSourceId] = FIRST_CODEPOINT + index;
    outlinedFrameCount += stageFrame(
      framesRoot,
      frameFile,
      stagedFrameFile,
      preparedFrames
    );
  }

  try {
    await generateFonts({
      inputDir: stagingDirectory,
      outputDir: mediaDirectory,
      name: FONT_NAME,
      fontTypes: [FontAssetType.WOFF],
      assetTypes: [OtherAssetType.JSON],
      formatOptions: { json: { indent: 2 } },
      fontHeight: 512,
      normalize: true,
      codepoints,
      getIconId: ({ basename }) => basename
    });
  } finally {
    fs.rmSync(stagingDirectory, { recursive: true, force: true });
  }

  writeGeneratedSource(frameFiles.length, frameDurations);
  updateIconContributions(frameFiles.length);

  console.log(
    `Generated ${frameFiles.length} Codex Cat frames from ${path.relative(
      projectRoot,
      framesRoot
    )}`
  );
  if (outlinedFrameCount > 0) {
    console.log(
      `Converted strokes to font-compatible outlines in ${outlinedFrameCount} frames`
    );
  }
}

function stageFrame(
  framesRoot,
  frameFile,
  stagedFrameFile,
  preparedFrames
) {
  const sourcePath = path.join(framesRoot, frameFile);
  const destinationPath = path.join(stagingDirectory, stagedFrameFile);
  let preparedFrame = preparedFrames.get(sourcePath);

  if (preparedFrame === undefined) {
    preparedFrame = prepareFrame(sourcePath, frameFile);
    preparedFrames.set(sourcePath, preparedFrame);
  }

  fs.writeFileSync(destinationPath, preparedFrame.content);
  return preparedFrame.outlined ? 1 : 0;
}

function prepareFrame(sourcePath, frameFile) {
  const source = fs.readFileSync(sourcePath);

  if (!hasVisibleStroke(source.toString('utf8'))) {
    return { content: source, outlined: false };
  }

  try {
    return { content: outlineSvgStrokes(source), outlined: true };
  } catch (error) {
    throw new Error(`Could not convert SVG strokes in ${frameFile}`, {
      cause: error
    });
  }
}

function outlineSvgStrokes(source) {
  const rendered = new Resvg(source, {
    background: '#fff',
    fitTo: { mode: 'width', value: STROKE_TRACE_WIDTH },
    font: { loadSystemFonts: false },
    shapeRendering: 2
  }).render();
  const outlined = vectorizeRawSync(
    rendered.pixels,
    { width: rendered.width, height: rendered.height },
    Preset.Bw
  );

  if (!/<path\b/i.test(outlined)) {
    throw new Error('Stroke tracing produced no paths');
  }

  return outlined;
}

function hasVisibleStroke(svg) {
  return /\bstroke\s*(?:=|:)\s*(?!['"]?none\b)/i.test(svg);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Could not read valid JSON from ${path.relative(projectRoot, filePath)}`,
      { cause: error }
    );
  }
}

function resolveFramesRoot(configuredRoot) {
  if (typeof configuredRoot !== 'string' || configuredRoot.trim() === '') {
    throw new Error('cat-animation.json must define a non-empty framesRoot');
  }

  const framesRoot = path.resolve(projectRoot, configuredRoot);
  const relativeRoot = path.relative(animationSourcesDirectory, framesRoot);

  if (
    relativeRoot === '' ||
    relativeRoot.startsWith(`..${path.sep}`) ||
    relativeRoot === '..' ||
    path.isAbsolute(relativeRoot)
  ) {
    throw new Error('framesRoot must be a folder inside animation-sources');
  }

  if (!fs.statSync(framesRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`framesRoot does not exist: ${configuredRoot}`);
  }

  return framesRoot;
}

function readSequence(framesRoot) {
  const sequencePath = path.join(framesRoot, 'sequence.json');
  return fs.existsSync(sequencePath) ? readJson(sequencePath) : undefined;
}

function discoverSvgFrames(framesRoot) {
  const frames = fs.readdirSync(framesRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && /^frame_[A-Za-z0-9_-]+\.svg$/i.test(entry.name)
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'));

  if (frames.length === 0) {
    throw new Error('framesRoot must contain at least one frame_*.svg file');
  }

  return frames;
}

function resolveFrameOrder(sequence, availableFrames) {
  if (sequence?.order !== undefined) {
    throw new Error(
      'sequence.json uses order; rename it to recommended_order'
    );
  }

  let frameFiles = availableFrames;

  if (sequence?.recommended_order !== undefined) {
    if (
      !Array.isArray(sequence.recommended_order) ||
      sequence.recommended_order.length === 0
    ) {
      throw new Error(
        'sequence.json recommended_order must be a non-empty array'
      );
    }

    frameFiles = sequence.recommended_order.map((frame) => {
      if (typeof frame !== 'string' || path.basename(frame) !== frame) {
        throw new Error('sequence.json frame names must be plain filenames');
      }

      if (!availableFrames.includes(frame)) {
        throw new Error(`sequence.json references a missing SVG: ${frame}`);
      }

      return frame;
    });
  }

  if (sequence?.frame_count !== undefined) {
    if (!Number.isInteger(sequence.frame_count) || sequence.frame_count <= 0) {
      throw new Error('sequence.json frame_count must be a positive integer');
    }

    if (sequence.frame_count !== frameFiles.length) {
      throw new Error(
        'sequence.json frame_count does not match the playback order'
      );
    }
  }

  return frameFiles;
}

function resolveFrameDurations(sequence, frameCount) {
  if (sequence?.duration_ms !== undefined) {
    throw new Error(
      'sequence.json uses duration_ms; rename it to recommended_timing_ms'
    );
  }

  if (sequence?.recommended_timing_ms === undefined) {
    return Array(frameCount).fill(DEFAULT_FRAME_DURATION_MS);
  }

  const durations = sequence.recommended_timing_ms;

  if (
    !Array.isArray(durations) ||
    durations.length !== frameCount ||
    durations.some(
      (duration) =>
        typeof duration !== 'number' ||
        !Number.isFinite(duration) ||
        duration <= 0
    )
  ) {
    throw new Error(
      'sequence.json recommended_timing_ms must contain one positive number per frame'
    );
  }

  return durations;
}

function writeGeneratedSource(frameCount, frameDurations) {
  const frameLabels = Array.from({ length: frameCount }, (_, index) =>
    `$(codex-cat-frame-${formatFrameNumber(index + 1)})`
  );
  const source = [
    '// Generated by tools/generate-cat-animation.cjs. Do not edit by hand.',
    `export const IDLE_CAT_FRAME = ${JSON.stringify(frameLabels[0])};`,
    '',
    `export const RUNNING_CAT_FRAMES = ${JSON.stringify(
      frameLabels,
      null,
      2
    )} as const;`,
    '',
    `export const RUNNING_CAT_FRAME_DURATIONS_MS = ${JSON.stringify(
      frameDurations,
      null,
      2
    )} as const;`,
    ''
  ].join('\n');

  writeIfChanged(generatedSourcePath, source);
}

function updateIconContributions(frameCount) {
  const packageJson = readJson(packageJsonPath);
  const contributedIcons = packageJson.contributes?.icons;
  const icons = Object.fromEntries(
    contributedIcons && typeof contributedIcons === 'object'
      ? Object.entries(contributedIcons).filter(
          ([iconId]) => !iconId.startsWith('codex-cat-frame-')
        )
      : []
  );

  for (let index = 0; index < frameCount; index += 1) {
    const frameNumber = formatFrameNumber(index + 1);
    const codepoint = FIRST_CODEPOINT + index;

    icons[`codex-cat-frame-${frameNumber}`] = {
      description: `Codex Cat animation frame ${index + 1}`,
      default: {
        fontPath: FONT_PATH,
        fontCharacter: `\\${codepoint.toString(16).toUpperCase()}`
      }
    };
  }

  packageJson.contributes ??= {};
  packageJson.contributes.icons = icons;
  writeIfChanged(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function formatFrameNumber(frameNumber) {
  return String(frameNumber).padStart(2, '0');
}

function writeIfChanged(filePath, content) {
  const currentContent = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8')
    : undefined;

  if (currentContent !== content) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Codex Cat animation generation failed.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = {
  discoverSvgFrames,
  resolveFrameDurations,
  resolveFrameOrder
};
