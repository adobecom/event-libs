import {
  getEntries, removeEntry, allowNotification, flushNotifications, setNotificationsReady,
} from '../../../../../event-libs/v1/features/swan-notifications/notification-store.js';

// WTR runs test files in parallel pages on the same origin. Isolate just SWAN's
// key per test page; independent store instances within a test still share it.
let stored = null;
let originalGet;
let originalSet;
let originalRemove;
before(() => {
  originalGet = Storage.prototype.getItem;
  originalSet = Storage.prototype.setItem;
  originalRemove = Storage.prototype.removeItem;
  Storage.prototype.getItem = function getItem(key) {
    return key === 'swan-notification-state-v3' ? stored : originalGet.call(this, key);
  };
  Storage.prototype.setItem = function setItem(key, value) {
    if (key === 'swan-notification-state-v3') stored = String(value);
    else originalSet.call(this, key, value);
  };
  Storage.prototype.removeItem = function removeItem(key) {
    if (key === 'swan-notification-state-v3') stored = null;
    else originalRemove.call(this, key);
  };
});

after(async () => {
  await flushNotifications();
  Storage.prototype.getItem = originalGet;
  Storage.prototype.setItem = originalSet;
  Storage.prototype.removeItem = originalRemove;
});

export async function resetNotifications() {
  await flushNotifications();
  getEntries().forEach((entry) => {
    removeEntry(entry.rfCode);
    allowNotification(entry.rfCode);
  });
  await flushNotifications();
  setNotificationsReady(true);
}
