import { html, useEffect, useRef } from '../../../../../deps/htm-preact.js';
import { YouTubeChat } from '../../../event-youtube/event-youtube.js';
import { trackBroadcastEvent } from '../../utils/broadcast-analytics.js';

// Reuses event-youtube.js's autoplay path since Milo's LiteYTEmbed is always click-to-play;
// the `event-youtube` class activates its CSS sizing rules. Launch owns YouTube Heartbeat
// tracking; the separate broadcast event remains a best-effort "started watching" signal.
export function YouTubePlayerAdapter({ session }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !session?.youTubeId) return undefined;

    const player = new YouTubeChat();
    player.config = { autoplay: 'true', title: session.title, videotype: 'live' };
    player.videoId = session.youTubeId;
    player.mountStream(container);
    trackBroadcastEvent(`Broadcast-Play-Start | ${session.id}`);

    return () => { container.innerHTML = ''; };
  }, [session?.id]);

  return html`<div class="sb-player__mount event-youtube" ref=${containerRef}></div>`;
}
