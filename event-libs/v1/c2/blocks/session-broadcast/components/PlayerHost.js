import { html } from '../../../../deps/htm-preact.js';
import { YouTubePlayerAdapter } from './players/YouTubePlayerAdapter.js';
import { MpcPlayerAdapter } from './players/MpcPlayerAdapter.js';

// One adapter at a time, picked by which video-source field is set. key=${session.id} forces
// a full remount on every switch, even within the same player type.
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
