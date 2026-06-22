// TODO: replace mock with real Mobile Rider API call when streaming integration is ready.

// eslint-disable-next-line no-unused-vars
export async function fetchLiveStatus(mrStreamIds, env) {
  return {
    active: new Set(),
    inactive: new Set(mrStreamIds),
  };
}
