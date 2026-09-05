// Local, network-free stand-in for the proposed window.eventNotificationBridge contract
// (see docs/PROPOSED-NOTIFICATION-API-CONTRACT.md). ensureNotificationBridge() in
// notification-bridge.js installs this only when nothing contract-shaped already exists
// at that global — delete this file (see ../REAL-API-CHECKLIST.md) once the
// global-nav/feds team ships the real thing.

const STORAGE_KEY = 'ns-notification-mock-store-v1';
const LOG_PREFIX = '[ns-notification:mock-bridge]';

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    return new Map(entries.map((entry) => [entry.id, entry]));
  } catch {
    return new Map();
  }
}

function persist(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...store.values()]));
  } catch {
    // persistence is a convenience for surviving a reload mid-cycle, not a requirement —
    // a full/disabled localStorage shouldn't break the in-memory store.
  }
}

// Gated behind ?nsDebug=1 so this never renders on a real page — purely a QA aid for
// seeing the mock's state without opening devtools.
function mountDebugPanel() {
  if (new URLSearchParams(window.location.search).get('nsDebug') !== '1') return null;

  const panel = document.createElement('ul');
  panel.id = 'ns-notification-debug-panel';
  document.body.append(panel);

  return (entries) => {
    panel.innerHTML = '';
    entries.forEach((entry) => {
      const li = document.createElement('li');
      li.textContent = `${entry.label}: ${entry.message} (${entry.id})`;
      panel.append(li);
    });
  };
}

export function installMockNotificationBridge() {
  const store = loadPersisted();
  const subscribers = new Set();
  const renderDebugPanel = mountDebugPanel();

  function notify() {
    persist(store);
    const snapshot = [...store.values()];
    renderDebugPanel?.(snapshot);
    subscribers.forEach((fn) => fn(snapshot));
  }

  const bridge = {
    add(notification) {
      store.set(notification.id, notification);
      // eslint-disable-next-line no-console
      console.info(`${LOG_PREFIX} add`, notification);
      window.lana?.log(`${LOG_PREFIX} add ${notification.id} (${notification.label})`);
      notify();
      return true;
    },

    edit(id, patch) {
      if (!store.has(id)) return false;
      store.set(id, { ...store.get(id), ...patch });
      // eslint-disable-next-line no-console
      console.info(`${LOG_PREFIX} edit`, id, patch);
      window.lana?.log(`${LOG_PREFIX} edit ${id} (${patch.label})`);
      notify();
      return true;
    },

    remove(id) {
      if (!store.has(id)) return false;
      store.delete(id);
      // eslint-disable-next-line no-console
      console.info(`${LOG_PREFIX} remove`, id);
      window.lana?.log(`${LOG_PREFIX} remove ${id}`);
      notify();
      return true;
    },

    list() {
      return [...store.values()];
    },

    subscribe(fn) {
      subscribers.add(fn);
      fn([...store.values()]);
      return () => subscribers.delete(fn);
    },
  };

  renderDebugPanel?.([...store.values()]);
  return bridge;
}
