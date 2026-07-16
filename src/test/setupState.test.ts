import * as assert from 'node:assert';
import {
  getIdleStatusPresentation,
  isKnownWorkingHookSignature,
  resolvePostInstallTransition,
  resolveSetupState
} from '../setupState';

suite('Codex Cat setup state', () => {
  test('does not describe an installed but unconfirmed hook as untrusted', () => {
    const state = resolveSetupState({
      installedSignature: 'current-signature',
      hookIsCurrent: true
    });
    const presentation = getIdleStatusPresentation(state);

    assert.strictEqual(state, 'installedUnconfirmed');
    assert.strictEqual(presentation.suffix, undefined);
    assert.strictEqual(presentation.action, 'review');
    assert.doesNotMatch(presentation.tooltip, /trust/i);
  });

  test('recognizes a matching signature that previously emitted events', () => {
    const state = resolveSetupState({
      installedSignature: 'working-signature',
      hookIsCurrent: true,
      lastWorkingSignature: 'working-signature'
    });

    assert.strictEqual(state, 'workingObserved');
    assert.strictEqual(getIdleStatusPresentation(state).action, undefined);
    assert.strictEqual(
      isKnownWorkingHookSignature('working-signature', 'working-signature'),
      true
    );
  });

  test('requires a new observation when the hook signature changes', () => {
    assert.strictEqual(
      resolveSetupState({
        installedSignature: 'new-signature',
        hookIsCurrent: true,
        lastWorkingSignature: 'old-signature'
      }),
      'installedUnconfirmed'
    );
  });

  test('preserves evidence and skips review for an unchanged working install', () => {
    assert.deepStrictEqual(
      resolvePostInstallTransition(
        'working-signature',
        'working-signature'
      ),
      {
        state: 'workingObserved',
        clearWorkingEvidence: false,
        showReviewPrompt: false
      }
    );
  });

  test('clears evidence and requests review for a new hook definition', () => {
    assert.deepStrictEqual(
      resolvePostInstallTransition('new-signature', 'old-signature'),
      {
        state: 'installedUnconfirmed',
        clearWorkingEvidence: true,
        showReviewPrompt: true
      }
    );
  });

  test('keeps missing and outdated hook states distinct', () => {
    assert.strictEqual(
      resolveSetupState({ hookIsCurrent: false }),
      'notInstalled'
    );
    assert.strictEqual(
      resolveSetupState({
        installedSignature: 'installed-signature',
        hookIsCurrent: false
      }),
      'updateRequired'
    );
  });

  test('uses concise user-facing status text', () => {
    assert.deepStrictEqual(getIdleStatusPresentation('notInstalled'), {
      suffix: 'Set up',
      tooltip: 'Set up Codex Cat',
      action: 'install'
    });
    assert.deepStrictEqual(getIdleStatusPresentation('updateRequired'), {
      suffix: 'Update',
      tooltip: 'Update Codex Cat',
      action: 'reinstall'
    });
    assert.deepStrictEqual(
      getIdleStatusPresentation('installedUnconfirmed'),
      {
        tooltip: 'Review Codex Cat hooks',
        action: 'review'
      }
    );
    assert.deepStrictEqual(getIdleStatusPresentation('configurationError'), {
      suffix: 'Setup needed',
      tooltip: 'Codex Cat needs setup. Click to fix.',
      action: 'install'
    });
    assert.deepStrictEqual(getIdleStatusPresentation('workingObserved'), {
      tooltip: 'Waiting for Codex'
    });
  });
});
