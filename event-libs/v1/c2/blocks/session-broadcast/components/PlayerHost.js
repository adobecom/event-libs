import { html } from '../../../../deps/htm-preact.js';
import { YouTubePlayerAdapter } from './players/YouTubePlayerAdapter.js';
import { MpcPlayerAdapter } from './players/MpcPlayerAdapter.js';

// Owns a single mounted player adapter at a time, keyed by which video-source field is
// populated on the active session (mutually exclusive per sessions-api.js's normalized
// shape). `key=${session.id}` makes Preact fully unmount/remount the adapter on every
// switch — required even within the same player type, and essential across types (YouTube
// and MPC are different player implementations, not a source swap, per the eng-sync note):
// picking a different branch below is itself a full unmount/remount, since it's a different
// component type at the same position — no extra teardown logic needed on top of that.
export function PlayerHost({ session }) {
  if (!session) return null;

  if (session.youTubeId) {
    return html`<${YouTubePlayerAdapter} session=${session} key=${session.id} />`;
  }

  if (session.mpcId) {
    return html`<${MpcPlayerAdapter} session=${session} key=${session.id} />`;
  }

  // MobileRider (future ticket) lands here.
  return html`
    <div class="sb-player__unsupported" role="status">
      This session's player type isn't supported yet.
    </div>
  `;
}
