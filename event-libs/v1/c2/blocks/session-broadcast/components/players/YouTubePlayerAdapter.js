import { html, useEffect, useRef } from '../../../../../deps/htm-preact.js';
import { YouTubeChat } from '../../../event-youtube/event-youtube.js';
import { trackBroadcastEvent } from '../../utils/broadcast-analytics.js';

// Reuses event-youtube.js's autoplay path since Milo's LiteYTEmbed is always click-to-play;
// the `event-youtube` class activates its CSS sizing rules. Fires one best-effort "started
// watching" event, not real play/pause — the autoplay iframe has no enablejsapi to hook
// onStateChange from (MPC gets real fidelity for free instead; asymmetry is intentional).
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
