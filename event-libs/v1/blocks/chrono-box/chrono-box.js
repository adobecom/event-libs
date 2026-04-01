import { getMetadata, getEventConfig, LIBS } from '../../utils/utils.js';

/** @param {HTMLElement} host */
function ensureReparentSet(host) {
  if (!host._chronoBoxReparentedRoots) {
    host._chronoBoxReparentedRoots = new Set();
  }
  return host._chronoBoxReparentedRoots;
}

/** Record element nodes removed from the chrono-box subtree (e.g. Milo hoisting a section to `main`). */
function ingestReparentedRemovedNodes(host, records) {
  const roots = ensureReparentSet(host);
  records.forEach((record) => {
    record.removedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) roots.add(node);
    });
  });
}

/**
 * Optional fragment teardown when content leaves this `.chrono-box` (teleport hooks, Milo misses).
 * @param {HTMLElement} chronoBoxEl
 * @param {() => void} teardown
 */
export function registerChronoBoxOutboundCleanup(chronoBoxEl, teardown) {
  if (!chronoBoxEl || typeof teardown !== 'function') return;
  if (!Array.isArray(chronoBoxEl._chronoBoxOutboundCleanup)) {
    chronoBoxEl._chronoBoxOutboundCleanup = [];
  }
  chronoBoxEl._chronoBoxOutboundCleanup.push(teardown);
}

/**
 * Observe reparents before `loadFragment` so Milo (sticky-section, tabs, etc.) can be cleaned on swap.
 * @param {HTMLElement} chronoBoxEl
 */
export function ensureChronoBoxReparentObserver(chronoBoxEl) {
  if (!chronoBoxEl) return;
  ensureReparentSet(chronoBoxEl);
  if (!chronoBoxEl._chronoBoxReparentObserver) {
    chronoBoxEl._chronoBoxReparentObserver = new MutationObserver((records) => {
      ingestReparentedRemovedNodes(chronoBoxEl, records);
    });
  }
  chronoBoxEl._chronoBoxReparentObserver.observe(chronoBoxEl, {
    childList: true,
    subtree: true,
  });
}

function disconnectReparentObserverAndRemoveOrphans(chronoBoxEl) {
  if (!chronoBoxEl) return;
  const obs = chronoBoxEl._chronoBoxReparentObserver;
  if (obs) {
    ingestReparentedRemovedNodes(chronoBoxEl, obs.takeRecords());
    obs.disconnect();
  }
  const roots = chronoBoxEl._chronoBoxReparentedRoots;
  if (!(roots instanceof Set)) return;
  roots.forEach((node) => {
    try {
      if (node?.isConnected) node.remove();
    } catch (error) {
      window.lana?.log(`chrono-box reparent cleanup: ${error.message}`);
    }
  });
  roots.clear();
}

/**
 * Before the next fragment: `before-swap` event, registered cleanups, reparent orphans, teleport markers.
 * @param {HTMLElement} chronoBoxEl
 */
export function cleanupChronoBoxOutboundNodes(chronoBoxEl) {
  if (!chronoBoxEl) return;

  const instanceId = chronoBoxEl.dataset?.chronoBoxInstance;

  try {
    if (instanceId) {
      chronoBoxEl.dispatchEvent(new CustomEvent('chrono-box:before-swap', {
        bubbles: true,
        detail: { root: chronoBoxEl, instanceId },
      }));
    }
  } catch (error) {
    window.lana?.log(`chrono-box:before-swap event: ${error.message}`);
  }

  const fns = chronoBoxEl._chronoBoxOutboundCleanup;
  if (Array.isArray(fns)) {
    fns.forEach((fn) => {
      try {
        fn();
      } catch (error) {
        window.lana?.log(`chrono-box outbound cleanup: ${error.message}`);
      }
    });
    chronoBoxEl._chronoBoxOutboundCleanup = [];
  }

  disconnectReparentObserverAndRemoveOrphans(chronoBoxEl);

  if (instanceId) {
    document.querySelectorAll(`[data-chrono-box-teleport="${instanceId}"]`).forEach((node) => {
      node.remove();
    });
  }
}

function buildScheduleDoubleLinkedList(entries) {
  if (!entries.length) return null;

  const head = { ...entries[0], next: null, prev: null };
  let current = head;

  for (let i = 1; i < entries.length; i += 1) {
    current.next = { ...entries[i], next: null, prev: current };
    current = current.next;
  }

  return head;
}

function getSchedule(scheduleId) {
  const scheduleJSONString = getMetadata('schedules');
  let thisSchedule;

  try {
    thisSchedule = JSON.parse(scheduleJSONString)[scheduleId];
  } catch (error) {
    window.lana?.log(`Error parsing schedule: ${error.message}`);
  }

  if (!thisSchedule) {
    window.lana?.log(`Schedule not found: ${scheduleId}`);
    return null;
  }

  return thisSchedule;
}

async function initPlugins(schedule) {
  const PLUGINS_MAP = {
    mobileRider: 'mobile-rider',
    metadata: 'metadata',
  };
  const hasPlugin = (plugin) => schedule.some((item) => item[plugin]);
  const pluginsNeeded = Object.keys(PLUGINS_MAP).filter(hasPlugin);

  const plugins = await Promise.all(pluginsNeeded.map((plugin) => {
    const pluginDir = PLUGINS_MAP[plugin];
    const pluginUrl = new URL(`../../features/timing-framework/plugins/${pluginDir}/plugin.js`, import.meta.url);
    return import(pluginUrl.href);
  }));

  let tabId = sessionStorage.getItem('chrono-box-tab-id');
  if (!tabId) {
    tabId = crypto.randomUUID();
    sessionStorage.setItem('chrono-box-tab-id', tabId);
  }

  const pluginsModules = new Map();
  await Promise.all(plugins.map(async (plugin, index) => {
    const pluginName = pluginsNeeded[index];
    pluginsModules.set(pluginName, await plugin.default(schedule));
  }));

  return { plugins: pluginsModules, tabId };
}

async function createBlobWorker(workerUrl) {
  const response = await fetch(workerUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch worker: ${response.status} ${response.statusText}`);
  }

  const workerCode = await response.text();
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}

async function createWorker(workerUrl) {
  let worker;
  let blobUrl = null;

  try {
    worker = new Worker(workerUrl, { type: 'module' });
    return { worker, blobUrl };
  } catch (error) {
    // cross-origin: fall through to blob worker
  }

  try {
    blobUrl = await createBlobWorker(workerUrl);
    worker = new Worker(blobUrl);
    return { worker, blobUrl };
  } catch (error) {
    window.lana?.log(`Failed to create worker: ${error.message}`);
    throw new Error(`Failed to create worker: ${error.message}`);
  }
}

async function setScheduleToScheduleWorker(schedule, plugins, tabId) {
  const scheduleLinkedList = buildScheduleDoubleLinkedList(schedule);

  const currentScriptUrl = new URL(import.meta.url);
  const workerUrl = new URL('../../features/timing-framework/worker-traditional.js', currentScriptUrl).href;

  const { worker, blobUrl } = await createWorker(workerUrl);

  const params = new URLSearchParams(document.location.search);
  const testTiming = params.get('timing');
  const serverTime = params.get('serverTime');
  const avoidStreamEndFlag = params.get('avoidStreamEndFlag');

  const testing = (testTiming || serverTime || avoidStreamEndFlag) ? {
    toggleTime: testTiming,
    serverTime,
    avoidStreamEndFlag,
  } : null;

  const pluginStates = Object.fromEntries(
    Array.from(plugins.entries())
      .map(([n, p]) => [n, { type: n, data: p.getAll ? p.getAll() : p }]),
  );

  const messageData = {
    schedule: scheduleLinkedList,
    plugins: pluginStates,
    testing,
    tabId,
  };

  try {
    worker.postMessage(messageData);
  } catch (error) {
    window.lana?.log(`Error posting message to worker: ${error.message}`);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
    throw error;
  }

  if (blobUrl) {
    worker._blobUrl = blobUrl;
  }

  worker.addEventListener('error', (event) => {
    window.lana?.log(`chrono-box worker error: ${event.message || 'unknown'}`);
  });

  return worker;
}

function requestAnimationFramePromise() {
  return new Promise((r) => {
    requestAnimationFrame(r);
  });
}

/**
 * After fragment load and height unlock: wait for layout, then scroll to the page hash.
 * Bounded rAF retry so ids from async nested blocks can appear before scrolling.
 * @param {(hash: string) => void} scrollToHashedElement
 */
async function scrollToHashAfterFragmentLayout(scrollToHashedElement) {
  const hash = window.location.hash;
  if (!hash || hash.includes('=')) return;

  await requestAnimationFramePromise();
  await requestAnimationFramePromise();

  let id = '';
  try {
    id = decodeURIComponent(hash.slice(1));
  } catch {
    id = hash.slice(1);
  }

  const maxAttempts = 12;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!id || document.getElementById(id)) {
      scrollToHashedElement(hash);
      return;
    }
    await requestAnimationFramePromise();
  }
  scrollToHashedElement(hash);
}

export default async function init(el) {
  const eventConfig = getEventConfig();
  const miloLibs = eventConfig?.miloConfig?.miloLibs ? eventConfig.miloConfig.miloLibs : LIBS;

  const [{ default: loadFragment }, {
    createTag, getLocale, getConfig, scrollToHashedElement,
  }] = await Promise.all([
    import(`${miloLibs}/blocks/fragment/fragment.js`),
    import(`${miloLibs}/utils/utils.js`),
  ]);

  const rows = el.querySelectorAll(':scope > div');
  let scheduleId = null;
  let staticSchedule = null;

  rows.forEach((row) => {
    const cols = Array.from(row.children);
    if (cols.length >= 2) {
      const key = cols[0].textContent.trim().toLowerCase();
      const value = cols[1].textContent.trim();

      if (key === 'schedule-id') {
        scheduleId = value;
      } else if (key === 'schedule') {
        try {
          staticSchedule = JSON.parse(value);
        } catch (error) {
          window.lana?.log(`Error parsing static schedule: ${error.message}`);
        }
      }
    }
  });

  const scheduleById = scheduleId ? getSchedule(scheduleId) : null;
  const thisSchedule = staticSchedule || scheduleById;

  if (!thisSchedule) {
    el.remove();
    return Promise.resolve();
  }

  el.setAttribute('data-tf-schedule-json', JSON.stringify(thisSchedule));
  el.dataset.chronoBoxInstance = crypto.randomUUID();
  el.innerHTML = '';

  // Modal hash: clear URL hash so Milo sees a real hashchange when the link target already matches.
  el.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-modal-hash]');
    if (!link) return;

    const targetHash = link.dataset.modalHash;
    if (!targetHash || window.location.hash !== targetHash) return;

    const modalId = targetHash.slice(1);
    const existingModal = document.getElementById(modalId);
    if (existingModal?.classList.contains('dialog-modal')) return;

    e.preventDefault();
    const { pathname, search } = window.location;
    window.history.replaceState(null, '', `${pathname}${search}`);
    window.location.hash = targetHash;
  });

  const pluginsOutputs = await initPlugins(thisSchedule);
  let worker;

  try {
    worker = await setScheduleToScheduleWorker(
      thisSchedule,
      pluginsOutputs.plugins,
      pluginsOutputs.tabId,
    );
  } catch (error) {
    window.lana?.log(`Error creating worker: ${error.message}`);
    el.innerHTML = '<div class="error-message">Unable to initialize timing system. Please refresh the page.</div>';
    el.classList.add('error');
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (worker._blobUrl) {
        URL.revokeObjectURL(worker._blobUrl);
        worker._blobUrl = null;
      }
      resolve();
    }, 3000);

    worker.onmessage = (event) => {
      clearTimeout(timeout);

      const rawPath = event.data?.pathToFragment;
      const fragmentPath = typeof rawPath === 'string' ? rawPath.trim() : '';

      const { prefix } = getLocale(getConfig().locales);
      el.style.height = `${el.clientHeight}px`;

      cleanupChronoBoxOutboundNodes(el);

      el.innerHTML = '';

      // href="" resolves to the current page; loadFragment would fetch and inject the full
      // document (including nested chrono-box blocks), causing unbounded recursion.
      if (!fragmentPath) {
        el.removeAttribute('style');
        if (worker._blobUrl) {
          URL.revokeObjectURL(worker._blobUrl);
          worker._blobUrl = null;
        }
        resolve();
        return;
      }

      const a = createTag('a', { href: `${fragmentPath.startsWith('/') ? prefix : ''}${fragmentPath}` }, '', { parent: el });

      ensureChronoBoxReparentObserver(el);

      if (worker._blobUrl) {
        URL.revokeObjectURL(worker._blobUrl);
        worker._blobUrl = null;
      }

      loadFragment(a)
        .then(async () => {
          el.removeAttribute('style');
          if (typeof scrollToHashedElement === 'function') {
            try {
              await scrollToHashAfterFragmentLayout(scrollToHashedElement);
            } catch (error) {
              window.lana?.log(`chrono-box hash scroll: ${error.message}`);
            }
          }
          resolve();
        })
        .catch((error) => {
          window.lana?.log(`Error loading fragment ${fragmentPath}: ${error.message}`);
          el.removeAttribute('style');
          el.innerHTML = '<div class="error-message">Unable to load content. Please refresh the page.</div>';
          el.classList.add('error');
          resolve();
        });
    };
  });
}
