import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

type AnimationGenerator = {
  discoverSvgFrames(framesRoot: string): string[];
  resolveFrameDurations(
    sequence: Record<string, unknown> | undefined,
    frameCount: number
  ): number[];
  resolveFrameOrder(
    sequence: Record<string, unknown> | undefined,
    availableFrames: string[]
  ): string[];
};

const generator = require('../../tools/generate-cat-animation.cjs') as
  AnimationGenerator;

suite('Codex Cat animation generator', () => {
  let framesRoot: string;

  setup(() => {
    framesRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'codex-cat-animation-generator-')
    );
  });

  teardown(() => {
    fs.rmSync(framesRoot, { recursive: true, force: true });
  });

  test('discovers only frame SVG files', () => {
    fs.writeFileSync(path.join(framesRoot, 'frame_02.svg'), '<svg/>');
    fs.writeFileSync(path.join(framesRoot, 'frame_01.svg'), '<svg/>');
    fs.writeFileSync(path.join(framesRoot, 'preview_animation.svg'), '<svg/>');
    fs.writeFileSync(path.join(framesRoot, 'contact_sheet.png'), 'preview');

    assert.deepStrictEqual(generator.discoverSvgFrames(framesRoot), [
      'frame_01.svg',
      'frame_02.svg'
    ]);
  });

  test('keeps repeated sequence entries and matching durations', () => {
    const sequence = {
      frame_count: 3,
      recommended_order: [
        'frame_01.svg',
        'frame_02.svg',
        'frame_01.svg'
      ],
      recommended_timing_ms: [50, 100, 50]
    };

    const frames = generator.resolveFrameOrder(sequence, [
      'frame_01.svg',
      'frame_02.svg'
    ]);

    assert.deepStrictEqual(frames, sequence.recommended_order);
    assert.deepStrictEqual(
      generator.resolveFrameDurations(sequence, frames.length),
      sequence.recommended_timing_ms
    );
  });

  test('rejects stale sequence field names and invalid frame counts', () => {
    assert.throws(
      () => generator.resolveFrameOrder({ order: [] }, ['frame_01.svg']),
      /rename it to recommended_order/
    );
    assert.throws(
      () => generator.resolveFrameDurations({ duration_ms: [] }, 1),
      /rename it to recommended_timing_ms/
    );
    assert.throws(
      () => generator.resolveFrameOrder(
        { frame_count: 2 },
        ['frame_01.svg']
      ),
      /does not match the playback order/
    );
  });
});
