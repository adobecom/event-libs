// Mobile Rider's batch media-status endpoint — only two environments on their side, not
// ESP's finer-grained split; `env` is session-store.js's already-collapsed mrEnv.
const MR_PROD_BASE_URL = 'https://overlay-admin-prod.mobilerider.com';
const MR_INTEGRATION_BASE_URL = 'https://overlay-admin-integration.mobilerider.com';

function mrBaseUrl(env) {
  return env === 'prod' ? MR_PROD_BASE_URL : MR_INTEGRATION_BASE_URL;
}

// Mobile Rider's media-status endpoint is all-or-nothing: a single unknown id 404s the whole
// batch, which would otherwise blind us to every valid, genuinely-live stream sent alongside it.
// Ids proven bad (they 404 even when queried alone) are quarantined for the session so a data
// error in one authored id can't keep poisoning the batch. This is a stopgap while the id data is
// corrected upstream — permanent quarantine, no re-probing (revisit once the team confirms policy).
const quarantinedIds = new Set();

// Thrown for a batch that 404s — meaning at least one id in it is unknown to Mobile Rider. Other
// statuses (5xx, network) stay generic throws so the poller retries them next tick instead of
// quarantining a valid id over a transient error.
class BatchNotFoundError extends Error {}

async function fetchBatch(mrStreamIds, env) {
  const url = `${mrBaseUrl(env)}/api/media-status?ids=${mrStreamIds.join(',')}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) throw new BatchNotFoundError(`Mobile Rider media-status 404 for ids: ${mrStreamIds.join(',')}`);
    throw new Error(`Mobile Rider media-status fetch failed: ${res.status}`);
  }
  const { active = [], inactive = [] } = await res.json();
  return { active, inactive };
}

// A batch 404 means at least one id in the set is bad. Bisect to isolate the good ids (which still
// resolve) from the bad ones (quarantined), so one bad id can't take down the rest of the batch.
async function resolveWithIsolation(mrStreamIds, env, active, inactive) {
  if (mrStreamIds.length === 1) {
    const [id] = mrStreamIds;
    quarantinedIds.add(id);
    window.lana?.log(`[mobile-rider] quarantined unknown stream id: ${id}`);
    return;
  }
  const mid = Math.floor(mrStreamIds.length / 2);
  const halves = [mrStreamIds.slice(0, mid), mrStreamIds.slice(mid)];
  await Promise.all(halves.map(async (half) => {
    try {
      const res = await fetchBatch(half, env);
      res.active.forEach((id) => active.add(id));
      res.inactive.forEach((id) => inactive.add(id));
    } catch (error) {
      if (!(error instanceof BatchNotFoundError)) throw error;
      await resolveWithIsolation(half, env, active, inactive);
    }
  }));
}

export async function fetchLiveStatus(mrStreamIds, env) {
  const ids = (mrStreamIds || []).filter((id) => !quarantinedIds.has(id));
  if (!ids.length) return { active: new Set(), inactive: new Set() };

  try {
    const { active, inactive } = await fetchBatch(ids, env);
    return { active: new Set(active), inactive: new Set(inactive) };
  } catch (error) {
    if (!(error instanceof BatchNotFoundError)) throw error;
    const active = new Set();
    const inactive = new Set();
    await resolveWithIsolation(ids, env, active, inactive);
    return { active, inactive };
  }
}
