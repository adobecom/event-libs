// Mobile Rider's batch live/inactive media-status endpoint. Only two environments exist on
// their side (not the finer-grained ESP dev/dev02/stage/stage02/prod/local split) — a shared
// qa/dev/stage/localhost host and a separate production host. `env` here is session-store.js's
// already-collapsed mrEnv ('dev' | 'stage' | 'prod'), via deriveMrEnv().
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
