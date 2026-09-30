import { setNotificationScope, setNotificationsReady } from '../../../../../event-libs/v1/features/swan-notifications/notification-store.js';

export const TEST_SCOPE = ['test-event', 'test-attendee', 'test-environment'];
export const LOCAL_STATE_PREFIX = `swan-notification-state-v4:${encodeURIComponent(JSON.stringify(TEST_SCOPE))}:`;

export function resetNotificationScope(suffix = '') {
  const scope = [TEST_SCOPE[0] + suffix, TEST_SCOPE[1], TEST_SCOPE[2]];
  const prefix = `swan-notification-state-v4:${encodeURIComponent(JSON.stringify(scope))}:`;
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
  keys.filter((key) => key.startsWith(prefix))
    .forEach((key) => localStorage.removeItem(key));
  setNotificationScope(null, null, null);
  setNotificationScope(...scope);
  setNotificationsReady(true);
}
