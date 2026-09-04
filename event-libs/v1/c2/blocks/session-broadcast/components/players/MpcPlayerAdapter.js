import { html, useEffect, useRef } from '../../../../../deps/htm-preact.js';
import { LIBS, getEventConfig } from '../../../../../utils/utils.js';
import { trackBroadcastEvent } from '../../utils/broadcast-analytics.js';

// adobetv.css never auto-loads since Milo's block-loader never mounted this block — inject
// once, same pattern as scripts.js's C2 foundation stylesheet.
let stylesLoaded = false;
function ensureAdobeTvStyles(miloLibs) {
  if (stylesLoaded) return;
  stylesLoaded = true;
  const link = document.createElement('link');
  link.setAttribute('rel', 'stylesheet');
  link.setAttribute('href', `${miloLibs}/blocks/adobetv/adobetv.css`);
  document.head.appendChild(link);
}

// adobetv.js's iframe posts {state:'play'|'pause', id} from video.tv.adobe.com as a public
// contract — mirrored here for analytics.
function handlePlaybackMessage(session) {
  return (event) => {
    if (event.origin !== 'https://video.tv.adobe.com' || !event.data) return;
    const { state, id } = event.data;
    if (!['play', 'pause'].includes(state) || String(id) !== String(session.mpcId)) return;
    trackBroadcastEvent(`Broadcast-${state === 'play' ? 'Play' : 'Pause'} | ${session.id}`);
  };
}

export function MpcPlayerAdapter({ session }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !session?.mpcId) return undefined;

    let cancelled = false;
    const onMessage = handlePlaybackMessage(session);
    window.addEventListener('message', onMessage);

    (async () => {
      const miloLibs = getEventConfig()?.miloConfig?.miloLibs ?? LIBS;
      ensureAdobeTvStyles(miloLibs);
      const { default: initAdobeTv } = await import(`${miloLibs}/blocks/adobetv/adobetv.js`);
      if (cancelled) return;

      // init() expects a live anchor and builds the iframe from it — no direct "iframe for
      // this ID" export exists.
      const anchor = document.createElement('a');
      anchor.href = `https://video.tv.adobe.com/v/${session.mpcId}?autoplay=true`;
      container.appendChild(anchor);
      initAdobeTv(anchor);
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('message', onMessage);
      container.innerHTML = '';
    };
  }, [session?.id]);

  return html`<div class="sb-player__mount" ref=${containerRef}></div>`;
}
