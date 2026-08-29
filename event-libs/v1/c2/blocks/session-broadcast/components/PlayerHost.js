import { html } from '../../../../deps/htm-preact.js';
import { YouTubePlayerAdapter } from './players/YouTubePlayerAdapter.js';

// Owns a single mounted player adapter at a time, keyed by which video-source field is
// populated on the active session (mutually exclusive per sessions-api.js's normalized
// shape). `key=${session.id}` makes Preact fully unmount/remount the adapter on every
// switch — required even within the same player type, and essential across types (YouTube
// and MPC are different player implementations, not a source swap, per the eng-sync note).
export function PlayerHost({ session }) {
  if (!session) return null;

  if (session.youTubeId) {
    return html`<${YouTubePlayerAdapter} session=${session} key=${session.id} />`;
  }

  // MPC (Phase 2) and MobileRider (future ticket) land here.
  return html`
    <div class="sb-player__unsupported" role="status">
      This session's player type isn't supported yet.
    </div>
  `;
}
