import MobileRiderController from './mobile-rider-controller.js';
import { getCurrentTabId } from '../../../../utils/utils.js';

const store = new Map();
const channel = new BroadcastChannel('mobile-rider-store');

export const mobileRiderStore = {
  get(sessionId) {
    return store.get(sessionId);
  },

  set(sessionId, isActive) {
    const tabId = getCurrentTabId();
    store.set(sessionId, isActive);
    channel.postMessage({ sessionId, isActive, tabId });
  },

  getAll() {
    return Object.fromEntries(store);
  },
};

// Unique MobileRider media ids in a schedule; accepts the object and the legacy array shape.
export function getScheduleMediaIds(schedule) {
  const ids = new Set();
  (schedule || []).forEach((entry) => {
    const mobileRider = entry?.mobileRider;
    if (mobileRider && typeof mobileRider === 'object' && mobileRider.sessionId) {
      ids.add(mobileRider.sessionId);
    } else if (Array.isArray(mobileRider)) {
      mobileRider.forEach((condition) => {
        if (condition?.sessionId) ids.add(condition.sessionId);
      });
    }
  });
  return [...ids];
}

export default async function init(schedule) {
  const ids = getScheduleMediaIds(schedule);
  if (!ids.length) return mobileRiderStore;

  // One media-status request for every stream in the schedule, not one per entry (MWPW-211386).
  const statusMap = await new MobileRiderController().getMediaStatusMap(ids);
  ids.forEach((id) => mobileRiderStore.set(id, statusMap.get(id) === true));

  return mobileRiderStore;
}
