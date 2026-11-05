import { html } from '../../../../deps/htm-preact.js';
import { YouTubePlayerAdapter } from './players/YouTubePlayerAdapter.js';
import { MpcPlayerAdapter } from './players/MpcPlayerAdapter.js';
import { getSessionKey } from '../../../../utils/session-state.js';

// The airing key remounts the player when switching between times of the same session.
export function PlayerHost({ session }) {
  if (!session) return null;

  if (session.youTubeId) {
    return html`<${YouTubePlayerAdapter} session=${session} key=${getSessionKey(session)} />`;
  }

  if (session.mpcId) {
    return html`<${MpcPlayerAdapter} session=${session} key=${getSessionKey(session)} />`;
  }

  // MobileRider (future ticket) lands here.
  return html`
    <div class="sb-player__unsupported" role="status">
      This session's player type isn't supported yet.
    </div>
  `;
}
