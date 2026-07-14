import { fetchLiveStatus } from './mobile-rider.js';

let _timerId = null;

async function tick(mrSessions, env, onUpdate) {
  try {
    const { active, inactive } = await fetchLiveStatus(
      mrSessions.map((s) => s.mrStreamId),
      env,
    );
    onUpdate(active, inactive, Date.now());
    if (mrSessions.every((s) => inactive.has(s.mrStreamId))) stopPolling();
  } catch (err) {
    window.lana?.log(`[sessions] MR poll failed: ${err.message}`);
  }
}

export function startPolling(mrSessions, env, onUpdate, intervalMs = 30_000) {
  stopPolling();
  if (!mrSessions.length) return null;
  tick(mrSessions, env, onUpdate);
  _timerId = setInterval(() => tick(mrSessions, env, onUpdate), intervalMs);
  return _timerId;
}

export function stopPolling() {
  clearInterval(_timerId);
  _timerId = null;
}
