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
        suffix: 'Set up',
        tooltip: 'Set up Codex Cat',
        action: 'install'
      };
    case 'updateRequired':
      return {
        suffix: 'Update',
        tooltip: 'Update Codex Cat',
        action: 'reinstall'
      };
    case 'installedUnconfirmed':
      return {
        tooltip: 'Review Codex Cat hooks',
        action: 'review'
      };
    case 'configurationError':
      return {
        suffix: 'Setup needed',
        tooltip: 'Codex Cat needs setup. Click to fix.',
        action: 'install'
      };
    case 'workingObserved':
      return {
        tooltip: 'Waiting for Codex'
      };
  }
}
