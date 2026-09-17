// Mobile Rider's batch media-status endpoint — only two environments on their side, not
// ESP's finer-grained split; `env` is session-store.js's already-collapsed mrEnv.
const MR_PROD_BASE_URL = 'https://overlay-admin-prod.mobilerider.com';
const MR_INTEGRATION_BASE_URL = 'https://overlay-admin-integration.mobilerider.com';

function mrBaseUrl(env) {
  return env === 'prod' ? MR_PROD_BASE_URL : MR_INTEGRATION_BASE_URL;
}

export async function fetchLiveStatus(mrStreamIds, env) {
  if (!mrStreamIds?.length) return { active: new Set(), inactive: new Set() };

  const url = `${mrBaseUrl(env)}/api/media-status?ids=${mrStreamIds.join(',')}`;
  // eslint-disable-next-line no-console
  console.log('[MRPoll] → calling MobileRider media-status', { url, env, ids: mrStreamIds });
  const res = await fetch(url);
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.log('[MRPoll] ✗ NOT OK (throws → poll treated as no update)', { status: res.status, url });
    throw new Error(`Mobile Rider media-status fetch failed: ${res.status}`);
  }
  const json = await res.json();
  const { active = [], inactive = [] } = json;
  // eslint-disable-next-line no-console
  console.log('[MRPoll] ✓ response', {
    status: res.status, rawJson: json, active, inactive,
  });
  return { active: new Set(active), inactive: new Set(inactive) };
}
