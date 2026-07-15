import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  IDLE_CAT_FRAME,
  RUNNING_CAT_FRAME_DURATIONS_MS,
  RUNNING_CAT_FRAMES
} from '../catFrames';

type IconContribution = {
  default?: {
    fontPath?: string;
    fontCharacter?: string;
  };
};

suite('Codex Cat animation frames', () => {
  test('matches the configured animation source', () => {
    const packageRoot = path.join(__dirname, '..', '..');
    const animationConfig = JSON.parse(
      fs.readFileSync(path.join(packageRoot, 'cat-animation.json'), 'utf8')
    ) as { framesRoot: string };
    const framesRoot = path.resolve(packageRoot, animationConfig.framesRoot);
    const sequencePath = path.join(framesRoot, 'sequence.json');
    const sequence = fs.existsSync(sequencePath)
      ? JSON.parse(fs.readFileSync(sequencePath, 'utf8')) as {
          recommended_order?: string[];
          recommended_timing_ms?: number[];
        }
      : {};
    const discoveredFrames = fs.readdirSync(framesRoot)
      .filter((filename) => /^frame_[A-Za-z0-9_-]+\.svg$/i.test(filename))
      .sort((left, right) => left.localeCompare(right, 'en'));
    const expectedFrames = sequence.recommended_order ?? discoveredFrames;
    const expectedDurations =
      sequence.recommended_timing_ms ?? Array(expectedFrames.length).fill(100);
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')
    ) as {
      contributes?: {
        icons?: Record<string, IconContribution>;
      };
    };
    const icons = packageJson.contributes?.icons ?? {};

    assert.strictEqual(
      RUNNING_CAT_FRAMES.length,
      expectedFrames.length
    );
    assert.strictEqual(IDLE_CAT_FRAME, '$(codex-cat-frame-01)');
    assert.deepStrictEqual(
      RUNNING_CAT_FRAME_DURATIONS_MS,
      expectedDurations
    );
    assert.strictEqual(
      Object.keys(icons).length,
      expectedFrames.length
    );

    for (let index = 1; index <= expectedFrames.length; index += 1) {
      const suffix = String(index).padStart(2, '0');
      const icon = icons[`codex-cat-frame-${suffix}`];

      assert.ok(icon, `frame ${suffix} is not contributed`);
      assert.strictEqual(
        icon.default?.fontPath,
        './media/codex-cat-frames.woff'
      );
      assert.strictEqual(
        icon.default?.fontCharacter,
        `\\${(0xE000 + index).toString(16).toUpperCase()}`
      );
      assert.strictEqual(
        RUNNING_CAT_FRAMES[index - 1],
        `$(codex-cat-frame-${suffix})`
      );
    }

    assert.ok(
      fs.statSync(path.join(packageRoot, 'media', 'codex-cat-frames.woff'))
        .size > 0
    );
  });
});
