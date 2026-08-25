import { deriveSessionState, getNowMs } from '../../utils/session-state.js';

// Detects session-state transitions (upcoming/live/on-demand) driven purely by time
// passing, not by a signal write — the gap being that liveStreamActiveIds only changes
// when there are MR sessions to poll, and sessions/favorited/scheduled don't change just
// because a clock tick crossed a session's start/end boundary. Takes plain getter
// callbacks (not signal imports) so it stays decoupled and testable, same as poller.js.

let _timerId = null;
let _lastStates = new Map();

function computeAndMaybeNotify(getSessions, getLiveStreamActiveIds, onChange, getNow, onTick) {
  const now = getNow();
  const sessionsList = getSessions();
  const liveIds = getLiveStreamActiveIds();

  let changed = false;
  sessionsList.forEach((s) => {
    const state = deriveSessionState(s, liveIds, now);
    if (_lastStates.get(s.id) !== state) changed = true;
    _lastStates.set(s.id, state);
  });
  if (changed) onChange();
  // Unlike onChange, fires on every tick regardless of whether the coarse
  // upcoming/live/on-demand bucket changed — a caller (SWAN's reconcile pass) may need
  // to notice a boundary this ticker doesn't itself track, e.g. a reminder lead time
  // before a session's start.
  onTick?.();

  const allOnDemand = sessionsList.length > 0
    && sessionsList.every((s) => deriveSessionState(s, liveIds, now) === 'on-demand');
  if (allOnDemand) stopSessionStateTicker();
}

// intervalMs/getNow are overridable for tests; production callers use the defaults.
export function startSessionStateTicker(getSessions, getLiveStreamActiveIds, onChange, {
  intervalMs = 15_000, getNow = getNowMs, onTick,
} = {}) {
  stopSessionStateTicker();
  _lastStates = new Map();
  computeAndMaybeNotify(getSessions, getLiveStreamActiveIds, onChange, getNow, onTick);
  _timerId = setInterval(
    () => computeAndMaybeNotify(getSessions, getLiveStreamActiveIds, onChange, getNow, onTick),
    intervalMs,
  );
}

export function stopSessionStateTicker() {
  clearInterval(_timerId);
  _timerId = null;
}
