export type CodexHookEvent = {
  type: 'UserPromptSubmit' | 'Stop';
  sessionId?: string;
  turnId?: string;
  timestamp?: number;
};

const TURN_KEY_PREFIX = 'turn:';
const SESSION_KEY_PREFIX = 'session:';
const ANONYMOUS_KEY = 'anonymous';

export function parseHookEvent(line: string): CodexHookEvent | undefined {
  let value: unknown;

  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (value.type !== 'UserPromptSubmit' && value.type !== 'Stop') {
    return undefined;
  }

  if (value.sessionId !== undefined && typeof value.sessionId !== 'string') {
    return undefined;
  }

  if (value.turnId !== undefined && typeof value.turnId !== 'string') {
    return undefined;
  }

  if (
    value.timestamp !== undefined &&
    (typeof value.timestamp !== 'number' || !Number.isFinite(value.timestamp))
  ) {
    return undefined;
  }

  return {
    type: value.type,
    sessionId: value.sessionId,
    turnId: value.turnId,
    timestamp: value.timestamp
  };
}

export function updateActiveTurnIds(
  activeTurnIds: ReadonlySet<string>,
  event: CodexHookEvent
): Set<string> {
  const nextActiveTurnIds = new Set(activeTurnIds);

  if (event.type === 'UserPromptSubmit') {
    nextActiveTurnIds.add(getSubmitKey(event));
    return nextActiveTurnIds;
  }

  if (!event.turnId && !event.sessionId) {
    nextActiveTurnIds.clear();
    return nextActiveTurnIds;
  }

  nextActiveTurnIds.delete(ANONYMOUS_KEY);

  if (event.turnId) {
    nextActiveTurnIds.delete(`${TURN_KEY_PREFIX}${event.turnId}`);
  }

  if (event.sessionId) {
    nextActiveTurnIds.delete(`${SESSION_KEY_PREFIX}${event.sessionId}`);
  }

  return nextActiveTurnIds;
}

export function updateObservedHookEventTypes(
  observedTypes: ReadonlySet<CodexHookEvent['type']>,
  event: CodexHookEvent
): Set<CodexHookEvent['type']> {
  const nextObservedTypes = new Set(observedTypes);
  nextObservedTypes.add(event.type);
  return nextObservedTypes;
}

export function haveBothHookEventTypesBeenObserved(
  observedTypes: ReadonlySet<CodexHookEvent['type']>
): boolean {
  return (
    observedTypes.has('UserPromptSubmit') && observedTypes.has('Stop')
  );
}

function getSubmitKey(event: CodexHookEvent): string {
  if (event.turnId) {
    return `${TURN_KEY_PREFIX}${event.turnId}`;
  }

  if (event.sessionId) {
    return `${SESSION_KEY_PREFIX}${event.sessionId}`;
  }

  return ANONYMOUS_KEY;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
