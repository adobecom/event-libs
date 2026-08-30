import { html, useEffect, useRef } from '../../../../../deps/htm-preact.js';
import { YouTubeChat } from '../../../event-youtube/event-youtube.js';
import { trackBroadcastEvent } from '../../utils/broadcast-analytics.js';

// Reuses event-youtube.js's autoplay path directly (see the plan's Architecture Decisions —
// Milo's LiteYTEmbed is always click-to-play, with no supported way to autoplay on load).
// YouTubeChat isn't designed to be re-run on the same instance, so a fresh one is built per
// mount; PlayerHost keys this component on session.id so switching sessions always remounts
// rather than reusing an instance. Chat stays off — session-broadcast has no chat feature.
//
// The mount carries the `event-youtube` class because event-youtube.css scopes every rule
// under it (`.event-youtube .youtube-stream`, etc.) — the standard block-CSS-scoping
// convention. Reusing that stylesheet (imported by session-broadcast.css) instead of
// duplicating its sizing/rounded-corner rules needs this ancestor class present.
//
// Play/watch-time analytics note: the raw autoplay iframe event-youtube.js builds carries no
// enablejsapi param, so there's no onStateChange bridge to hook real play/pause events from
// without hand-building the iframe ourselves (buildEmbedUrl has no passthrough param, and
// duplicating buildStream()'s CSS-dependent markup just to add one query param isn't worth
// it) — this fires a single best-effort "started watching" event on mount instead of true
// per-state fidelity. MPC gets real play/pause fidelity for free via adobetv.js's own
// postMessage contract (see MpcPlayerAdapter.js) — this asymmetry is intentional.
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
