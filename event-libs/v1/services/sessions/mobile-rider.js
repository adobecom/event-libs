import { logWarning } from '../../utils/lana-log.js';

// Mobile Rider's batch media-status endpoint — only two environments on their side, not
// ESP's finer-grained split; `env` is session-store.js's already-collapsed mrEnv.
const MR_PROD_BASE_URL = 'https://overlay-admin.mobilerider.com';
const MR_INTEGRATION_BASE_URL = 'https://overlay-admin-integration.mobilerider.com';

// Mobile Rider's 404 body: "ID <id> not found in JSON data."
const UNKNOWN_ID_RE = /^ID (\S+) not found/;
export const MAX_UNKNOWN_ID_RETRIES = 3;
export const UNKNOWN_ID_RECHECK_MS = 5 * 60 * 1000;

// `${env}:${id}` -> when the id was last reported unknown, so each 30s tick doesn't repeat the 404.
const unknownIds = new Map();

function mrBaseUrl(env) {
  return env === 'prod' ? MR_PROD_BASE_URL : MR_INTEGRATION_BASE_URL;
}

export function getUnknownMediaId(message) {
  return UNKNOWN_ID_RE.exec(message || '')?.[1];
}

/**
 * Mobile Rider fails the whole request with a 404 naming the first unknown id. That id is
 * reported as inactive and the rest are retried, so one bad id can't hide every live stream.
 */
export async function fetchLiveStatus(mrStreamIds, env) {
  if (!mrStreamIds?.length) return { active: new Set(), inactive: new Set() };

  const now = Date.now();
  const unknown = new Set();
  let ids = mrStreamIds.filter((id) => {
    const seenAt = unknownIds.get(`${env}:${id}`);
    if (seenAt === undefined || now - seenAt >= UNKNOWN_ID_RECHECK_MS) return true;
    unknown.add(id);
    return false;
  });

  for (let retries = 0; ids.length; retries += 1) {
    // Requests are sequential: each retry depends on the id the previous 404 named.
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(`${mrBaseUrl(env)}/api/media-status?ids=${ids.join(',')}`);
    if (res.ok) {
      // eslint-disable-next-line no-await-in-loop
      const { active = [], inactive = [] } = await res.json();
      ids.forEach((id) => unknownIds.delete(`${env}:${id}`));
      return { active: new Set(active), inactive: new Set([...inactive, ...unknown]) };
    }

    // eslint-disable-next-line no-await-in-loop
    const body = res.status === 404 ? await res.json().catch(() => ({})) : {};
    const unknownId = getUnknownMediaId(body?.message);
    if (retries >= MAX_UNKNOWN_ID_RETRIES || !ids.includes(unknownId)) {
      // The API's own message is what shows whether its 404 wording changed.
      const detail = typeof body?.message === 'string' ? `: ${body.message}` : '';
      throw new Error(`Mobile Rider media-status fetch failed: ${res.status}${detail}`);
    }
    logWarning('mobile-rider-service', 'unknown media id, marked inactive', { id: unknownId });
    unknownIds.set(`${env}:${unknownId}`, Date.now());
    unknown.add(unknownId);
    ids = ids.filter((id) => id !== unknownId);
  }

  return { active: new Set(), inactive: unknown };
}
