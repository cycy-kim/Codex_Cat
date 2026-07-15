import * as assert from 'node:assert';
import {
  haveBothHookEventTypesBeenObserved,
  parseHookEvent,
  updateActiveTurnIds,
  updateObservedHookEventTypes,
  type CodexHookEvent
} from '../hookEvents';

suite('Codex Cat hook events', () => {
  test('tracks concurrent turns by turn ID', () => {
    let activeTurnIds = new Set<string>();

    activeTurnIds = updateActiveTurnIds(
      activeTurnIds,
      event('UserPromptSubmit', 'session-1', 'turn-1')
    );
    activeTurnIds = updateActiveTurnIds(
      activeTurnIds,
      event('UserPromptSubmit', 'session-2', 'turn-2')
    );

    assert.strictEqual(activeTurnIds.size, 2);

    activeTurnIds = updateActiveTurnIds(
      activeTurnIds,
      event('Stop', 'session-1', 'turn-1')
    );

    assert.strictEqual(activeTurnIds.size, 1);

    activeTurnIds = updateActiveTurnIds(
      activeTurnIds,
      event('Stop', 'session-2', 'turn-2')
    );

    assert.strictEqual(activeTurnIds.size, 0);
  });

  test('uses the session ID when a submit event has no turn ID', () => {
    let activeTurnIds = new Set<string>();

    activeTurnIds = updateActiveTurnIds(
      activeTurnIds,
      event('UserPromptSubmit', 'session-1')
    );
    activeTurnIds = updateActiveTurnIds(
      activeTurnIds,
      event('UserPromptSubmit', 'session-2')
    );

    activeTurnIds = updateActiveTurnIds(
      activeTurnIds,
      event('Stop', 'session-1', 'turn-reported-later')
    );

    assert.strictEqual(activeTurnIds.size, 1);

    activeTurnIds = updateActiveTurnIds(
      activeTurnIds,
      event('Stop', 'session-2')
    );

    assert.strictEqual(activeTurnIds.size, 0);
  });

  test('removes both the turn key and matching session fallback on stop', () => {
    let activeTurnIds = updateActiveTurnIds(
      new Set<string>(),
      event('UserPromptSubmit', 'session-1', 'turn-1')
    );
    activeTurnIds = updateActiveTurnIds(
      activeTurnIds,
      event('UserPromptSubmit', 'session-1')
    );
    activeTurnIds = updateActiveTurnIds(
      activeTurnIds,
      event('UserPromptSubmit', 'session-2', 'turn-2')
    );

    assert.strictEqual(activeTurnIds.size, 3);

    activeTurnIds = updateActiveTurnIds(
      activeTurnIds,
      event('Stop', 'session-1', 'turn-1')
    );

    assert.strictEqual(activeTurnIds.size, 1);

    activeTurnIds = updateActiveTurnIds(
      activeTurnIds,
      event('Stop', 'session-2', 'turn-2')
    );

    assert.strictEqual(activeTurnIds.size, 0);
  });

  test('clears every active turn when a stop event has no IDs', () => {
    let activeTurnIds = updateActiveTurnIds(
      new Set<string>(),
      event('UserPromptSubmit', 'session-1', 'turn-1')
    );
    activeTurnIds = updateActiveTurnIds(
      activeTurnIds,
      event('UserPromptSubmit', 'session-2')
    );

    activeTurnIds = updateActiveTurnIds(activeTurnIds, event('Stop'));

    assert.strictEqual(activeTurnIds.size, 0);
  });

  test('clears an anonymous fallback on the next identified stop', () => {
    let activeTurnIds = updateActiveTurnIds(
      new Set<string>(),
      event('UserPromptSubmit')
    );

    activeTurnIds = updateActiveTurnIds(
      activeTurnIds,
      event('Stop', 'session-1', 'turn-1')
    );

    assert.strictEqual(activeTurnIds.size, 0);
  });

  test('does not mutate the previous active-turn set', () => {
    const previous = new Set<string>();
    const next = updateActiveTurnIds(
      previous,
      event('UserPromptSubmit', 'session-1', 'turn-1')
    );

    assert.strictEqual(previous.size, 0);
    assert.strictEqual(next.size, 1);
  });

  test('requires both hook event types before confirming the setup works', () => {
    const empty = new Set<CodexHookEvent['type']>();
    const submitOnly = updateObservedHookEventTypes(
      empty,
      event('UserPromptSubmit')
    );

    assert.strictEqual(haveBothHookEventTypesBeenObserved(empty), false);
    assert.strictEqual(
      haveBothHookEventTypesBeenObserved(submitOnly),
      false
    );

    const both = updateObservedHookEventTypes(submitOnly, event('Stop'));

    assert.strictEqual(haveBothHookEventTypesBeenObserved(both), true);
    assert.strictEqual(empty.size, 0);
  });

  test('parses valid hook events and ignores malformed input', () => {
    assert.deepStrictEqual(
      parseHookEvent(JSON.stringify({
        type: 'UserPromptSubmit',
        sessionId: 'session-1',
        turnId: 'turn-1',
        timestamp: 123
      })),
      {
        type: 'UserPromptSubmit',
        sessionId: 'session-1',
        turnId: 'turn-1',
        timestamp: 123
      }
    );

    assert.strictEqual(parseHookEvent('{not-json'), undefined);
    assert.strictEqual(parseHookEvent('[]'), undefined);
    assert.strictEqual(parseHookEvent('{"type":"Unknown"}'), undefined);
    assert.strictEqual(
      parseHookEvent('{"type":"Stop","turnId":123}'),
      undefined
    );
    assert.strictEqual(
      parseHookEvent('{"type":"Stop","timestamp":1e400}'),
      undefined
    );
  });
});

function event(
  type: CodexHookEvent['type'],
  sessionId?: string,
  turnId?: string
): CodexHookEvent {
  return { type, sessionId, turnId };
}
