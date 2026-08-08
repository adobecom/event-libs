// Mobile Rider's batch media-status endpoint — only two environments on their side, not
// ESP's finer-grained split; `env` is session-store.js's already-collapsed mrEnv.
const MR_PROD_BASE_URL = 'https://overlay-admin.mobilerider.com';
const MR_DEV_BASE_URL = 'https://overlay-admin-dev.mobilerider.com';

function mrBaseUrl(env) {
  return env === 'prod' ? MR_PROD_BASE_URL : MR_DEV_BASE_URL;
}

export async function fetchLiveStatus(mrStreamIds, env) {
  if (!mrStreamIds?.length) return { active: new Set(), inactive: new Set() };

  const res = await fetch(`${mrBaseUrl(env)}/api/media-status?ids=${mrStreamIds.join(',')}`);
  if (!res.ok) {
    throw new Error(`Mobile Rider media-status fetch failed: ${res.status}`);
  }
  const { active = [], inactive = [] } = await res.json();
  return { active: new Set(active), inactive: new Set(inactive) };
}
