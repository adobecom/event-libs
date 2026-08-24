import { useComputed } from '../../../../deps/htm-preact.js';
import {
  sessions, liveStreamActiveIds, sessionStateVersion, getApiConfig,
} from '../../../../utils/session-store.js';
import { isPostEvent, getNowMs } from '../../../../utils/session-state.js';

// sessionStateVersion has no value of its own; reading it is what makes this recompute on a
// purely time-driven transition, with no accompanying sessions/liveStreamActiveIds write.
export function useIsPostEvent() {
  return useComputed(() => {
    void sessionStateVersion.value;
    return isPostEvent(sessions.value, liveStreamActiveIds.value, getNowMs(), getApiConfig()?.eventEndMs);
  }).value;
}
