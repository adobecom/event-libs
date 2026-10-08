import { logError, logWarning } from '../../utils/lana-log.js';

let playerCount = 0;
const registeredIframes = new WeakSet();

export function createYouTubePlayerId() {
  let id;
  do {
    playerCount += 1;
    id = `player-${playerCount}`;
  } while (document.getElementById(id));
  return id;
}

export function buildYouTubeAnalyticsParams(videoType = 'vod') {
  return new URLSearchParams({
    enablejsapi: '1',
    rel: '0',
    videotype: videoType,
  });
}

export function registerYouTubeTracking(iframe, scope) {
  if (!iframe?.isConnected || registeredIframes.has(iframe)) return;
  registeredIframes.add(iframe);

  const trackWhenReady = () => {
    if (document.readyState !== 'complete') return;
    document.removeEventListener('readystatechange', trackWhenReady);
    if (!iframe.isConnected) return;

    try {
      const satellite = window._satellite;
      if (typeof satellite?.track !== 'function') {
        logWarning(scope, 'YouTube tracking unavailable: Launch is not ready');
        return;
      }
      satellite.track('trackYoutube');
    } catch (err) {
      logError(scope, 'failed to register YouTube tracking', err);
    }
  };

  if (document.readyState === 'complete') trackWhenReady();
  else document.addEventListener('readystatechange', trackWhenReady);
}
