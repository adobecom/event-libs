import { html, useEffect, useRef } from '../../../../../deps/htm-preact.js';
import { YouTubeChat } from '../../../event-youtube/event-youtube.js';
import { trackBroadcastEvent } from '../../utils/broadcast-analytics.js';

// Reuses event-youtube.js's autoplay path — Milo's LiteYTEmbed is always click-to-play, with
// no way to autoplay on load. A fresh YouTubeChat instance per mount; it isn't meant to be
// re-run. `event-youtube` class activates event-youtube.css's own scoped sizing rules.
//
// Fires a single best-effort "started watching" event, not real play/pause fidelity — the
// autoplay iframe carries no enablejsapi param to hook onStateChange from. MPC gets real
// fidelity for free instead (see MpcPlayerAdapter.js); this asymmetry is intentional.
export function YouTubePlayerAdapter({ session }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !session?.youTubeId) return undefined;

    const player = new YouTubeChat();
    player.config = { autoplay: 'true', videotitle: session.title };
    player.videoId = session.youTubeId;
    container.appendChild(player.buildStream());
    trackBroadcastEvent(`Broadcast-Play-Start | ${session.id}`);

    return () => { container.innerHTML = ''; };
  }, [session?.id]);

  return html`<div class="sb-player__mount event-youtube" ref=${containerRef}></div>`;
}
