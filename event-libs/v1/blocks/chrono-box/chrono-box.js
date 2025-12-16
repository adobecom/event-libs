import { getMetadata, getEventConfig, LIBS } from '../../utils/utils.js';

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

  // Shared tabId for BroadcastChannel communication across chrono-boxes
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

// Creates blob-based worker for cross-origin scenarios
async function createBlobWorker(workerUrl) {
  const response = await fetch(workerUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch worker: ${response.status} ${response.statusText}`);
  }
  
  const workerCode = await response.text();
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}

// Creates worker with automatic cross-origin fallback
async function createWorker(workerUrl) {
  let worker;
  let blobUrl = null;

  try {
    // Try direct Worker first (optimal for same-origin)
    worker = new Worker(workerUrl, { type: 'module' });
    return { worker, blobUrl };
  } catch (error) {
    // Expected: falls back to blob worker for cross-origin
  }

  try {
    // Fallback: blob-based worker for cross-origin
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
  const testing = testTiming ? { toggleTime: testTiming } : null;

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

  return worker;
}

export default async function init(el) {
  const eventConfig = getEventConfig();
  const miloLibs = eventConfig?.miloConfig?.miloLibs ? eventConfig.miloConfig.miloLibs : LIBS;

  const [{ default: loadFragment }, { createTag, getLocale, getConfig }] = await Promise.all([
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

  el.innerHTML = '';

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

      const { pathToFragment } = event.data;
      const { prefix } = getLocale(getConfig().locales);
      el.style.height = `${el.clientHeight}px`;

      el.innerHTML = '';

      const a = createTag('a', { href: `${prefix}${pathToFragment}` }, '', { parent: el });
      console.log('Selected Fragment', a);
      loadFragment(a).then(() => {
        el.removeAttribute('style');
      }).catch((error) => {
        window.lana?.log(`Error loading fragment ${pathToFragment}: ${error.message}`);
        el.removeAttribute('style');
        el.innerHTML = '<div class="error-message">Unable to load content. Please refresh the page.</div>';
        el.classList.add('error');
      });

      if (worker._blobUrl) {
        URL.revokeObjectURL(worker._blobUrl);
        worker._blobUrl = null;
      }

      resolve();
    };
  });
}
