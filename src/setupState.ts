export type SetupState =
  | 'notInstalled'
  | 'updateRequired'
  | 'installedUnconfirmed'
  | 'workingObserved'
  | 'configurationError';

export type SetupAction = 'install' | 'reinstall' | 'review';

export type IdleStatusPresentation = {
  suffix?: string;
  tooltip: string;
  action?: SetupAction;
};

export type PostInstallTransition = {
  state: 'installedUnconfirmed' | 'workingObserved';
  clearWorkingEvidence: boolean;
  showReviewPrompt: boolean;
};

type SetupInspection = {
  installedSignature?: string;
  hookIsCurrent: boolean;
  lastWorkingSignature?: string;
};

export function isKnownWorkingHookSignature(
  installedSignature: string | undefined,
  lastWorkingSignature: string | undefined
): boolean {
  return (
    installedSignature !== undefined &&
    installedSignature === lastWorkingSignature
  );
}

export function resolveSetupState(
  inspection: SetupInspection
): SetupState {
  if (!inspection.installedSignature) {
    return 'notInstalled';
  }

  if (!inspection.hookIsCurrent) {
    return 'updateRequired';
  }

  return isKnownWorkingHookSignature(
    inspection.installedSignature,
    inspection.lastWorkingSignature
  )
    ? 'workingObserved'
    : 'installedUnconfirmed';
}

export function resolvePostInstallTransition(
  installedSignature: string,
  lastWorkingSignature: string | undefined
): PostInstallTransition {
  const knownWorking = isKnownWorkingHookSignature(
    installedSignature,
    lastWorkingSignature
  );

  return {
    state: knownWorking ? 'workingObserved' : 'installedUnconfirmed',
    clearWorkingEvidence: !knownWorking,
    showReviewPrompt: !knownWorking
  };
}

export function getIdleStatusPresentation(
  state: SetupState
): IdleStatusPresentation {
  switch (state) {
    case 'notInstalled':
      return {
        suffix: 'Setup',
        tooltip: 'Codex Cat: click to install Codex hooks',
        action: 'install'
      };
    case 'updateRequired':
      return {
        suffix: 'Update hooks',
        tooltip: 'Codex Cat: click to update the installed hook script',
        action: 'reinstall'
      };
    case 'installedUnconfirmed':
      return {
        tooltip:
          'Codex Cat: send a Codex message to verify setup; click if animation does not start',
        action: 'review'
      };
    case 'configurationError':
      return {
        suffix: 'Setup error',
        tooltip:
          'Codex Cat: hooks.json could not be read safely; click for setup',
        action: 'install'
      };
    case 'workingObserved':
      return {
        tooltip: 'Codex Cat: waiting for Codex'
      };
  }
}
