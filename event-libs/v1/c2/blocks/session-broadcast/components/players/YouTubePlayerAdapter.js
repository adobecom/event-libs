import { html, useEffect, useRef } from '../../../../../deps/htm-preact.js';
import { YouTubeChat } from '../../../event-youtube/event-youtube.js';

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
export function YouTubePlayerAdapter({ session }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !session?.youTubeId) return undefined;

    const player = new YouTubeChat();
    player.config = { autoplay: 'true', videotitle: session.title };
    player.videoId = session.youTubeId;
    container.appendChild(player.buildStream());

    return () => { container.innerHTML = ''; };
  }, [session?.id]);

  return html`<div class="sb-player__mount event-youtube" ref=${containerRef}></div>`;
}
