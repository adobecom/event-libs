// TODO: replace mock with real Mobile Rider API call when streaming integration is ready.

export async function fetchLiveStatus(mrStreamIds, env) {
  return {
    active: new Set(),
    inactive: new Set(mrStreamIds),
  };
}
