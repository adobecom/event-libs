import { html, useEffect, useRef } from '../../../../../deps/htm-preact.js';
import { LIBS, getEventConfig } from '../../../../../utils/utils.js';

// Milo's adobetv.css (the shared `.milo-video`/`.milo-video iframe` 16:9 sizing rules, from
// libs/styles/iframe.css) isn't loaded automatically the way it would be if Milo's own
// block-loader had mounted the `adobetv` block for us — injected once here instead, same
// dynamic-<link> pattern event-libs' own scripts.js uses for the C2 foundation stylesheet.
let stylesLoaded = false;
function ensureAdobeTvStyles(miloLibs) {
  if (stylesLoaded) return;
  stylesLoaded = true;
  const link = document.createElement('link');
  link.setAttribute('rel', 'stylesheet');
  link.setAttribute('href', `${miloLibs}/blocks/adobetv/adobetv.css`);
  document.head.appendChild(link);
}

// Reuses Milo's adobetv.js directly — its init(a) expects a live anchor element, builds the
// iframe as a sibling via insertAdjacentElement, and removes the anchor once done. No exported
// "give me an iframe for video ID X" function exists, so this constructs a real, temporarily
// attached synthetic anchor and lets Milo's own init() do everything: iframe creation, the
// async accessible-title fetch, the play/pause postMessage listener, and visibility-based
// auto-pause. Confirmed via a live spike (video.tv.adobe.com/v/<id>, with vs without
// ?autoplay=true) that Milo's own unmodified URL, with just autoplay=true appended, actually
// autoplays — no "tap to play" fallback needed.
export function MpcPlayerAdapter({ session }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !session?.mpcId) return undefined;

    let cancelled = false;
    (async () => {
      const miloLibs = getEventConfig()?.miloConfig?.miloLibs ?? LIBS;
      ensureAdobeTvStyles(miloLibs);
      const { default: initAdobeTv } = await import(`${miloLibs}/blocks/adobetv/adobetv.js`);
      if (cancelled) return;

      const anchor = document.createElement('a');
      anchor.href = `https://video.tv.adobe.com/v/${session.mpcId}?autoplay=true`;
      container.appendChild(anchor);
      initAdobeTv(anchor);
    })();

    return () => {
      cancelled = true;
      container.innerHTML = '';
    };
  }, [session?.id]);

  return html`<div class="sb-player__mount" ref=${containerRef}></div>`;
}
