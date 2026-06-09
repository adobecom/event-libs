import { fetchLiveStatus } from './mobile-rider.js';

let _dispatch = null;
let _timerId = null;

export function injectDispatch(dispatch) {
  _dispatch = dispatch;
}

async function tick(mrSessions, env) {
  try {
    const { active, inactive } = await fetchLiveStatus(
      mrSessions.map((s) => s.mrStreamId),
      env,
    );
    _dispatch?.({ type: 'LIVE_STATUS_UPDATE', active, inactive, now: Date.now() });
    if (mrSessions.every((s) => inactive.has(s.mrStreamId))) stopPolling();
  } catch (err) {
    window.lana?.log(`[sessions-guide] MR poll failed: ${err.message}`);
  }
}

export function startPolling(mrSessions, env, intervalMs = 30_000) {
  if (!mrSessions.length) return null;
  tick(mrSessions, env);
  _timerId = setInterval(() => tick(mrSessions, env), intervalMs);
  return _timerId;
}

export function stopPolling() {
  clearInterval(_timerId);
  _timerId = null;
}
