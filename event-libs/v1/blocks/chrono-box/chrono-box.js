import { readBlockConfig, getMetadata, getEventConfig, LIBS } from '../../utils/utils.js';

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
  } catch (e) {
    window.lana?.log(`Error parsing schedule: ${JSON.stringify(e)}`);
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
    const { eventLibs } = getEventConfig();
    return import(`${eventLibs}/features/timing-framework/plugins/${pluginDir}/plugin.js`);
  }));

  // Get or create a global tabId that's shared across all chrono-boxes on this page
  // This ensures that multiple chrono-boxes on the same page use the same tabId,
  // allowing their plugin stores to communicate via BroadcastChannel correctly
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

async function createBlobWorker() {
  // Get the current version of the event-libs
  const { eventLibs } = getEventConfig();
  const remoteWorkerUrl = `${eventLibs}/features/timing-framework/worker-traditional.js`;
  
  // Fetch the traditional worker file
  const response = await fetch(remoteWorkerUrl);
  if (!response.ok) {
    throw new Error('Failed to fetch traditional worker');
  }
  
  const workerCode = await response.text();
  
  // Create a Blob URL for the worker
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}

async function setScheduleToScheduleWorker(schedule, plugins, tabId) {
  const scheduleLinkedList = buildScheduleDoubleLinkedList(schedule);

  // Add error handling for worker creation
  let worker;
  let blobUrl;
  
  try {
    // Try to create a Blob-based worker first (for cross-origin scenarios)
    blobUrl = await createBlobWorker();
    worker = new Worker(blobUrl);
  } catch (blobError) {
    window.lana?.log(`Error creating blob worker, falling back to direct import: ${JSON.stringify(blobError)}`);
    
    try {
      // Fallback to direct import (works for same-origin scenarios)
      const { eventLibs } = getEventConfig();
      worker = new Worker(`${eventLibs}/features/timing-framework/worker-traditional.js`);
    } catch (directError) {
      window.lana?.log(`Error creating direct worker: ${JSON.stringify(directError)}`);
      throw directError;
    }
  }

  // Get testing data from URL params
  const params = new URLSearchParams(document.location.search);
  const testTiming = params.get('timing');
  const testing = testTiming ? { toggleTime: testTiming } : null;

  // Convert plugin instances to their serializable state
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
    window.lana?.log(`Error posting message to worker: ${JSON.stringify(error)}`);
    // Clean up blob URL if it was created
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
    throw error;
  }

  // Store blob URL for cleanup later
  worker._blobUrl = blobUrl;

  return worker;
}

export default async function init(el) {
  const eventConfig = getEventConfig();
  const miloLibs = eventConfig?.miloConfig?.miloLibs ? eventConfig.miloConfig.miloLibs : LIBS;

  const [{ default: loadFragment }, { createTag, getLocale, getConfig }] = await Promise.all([
    import(`${miloLibs}/blocks/fragment/fragment.js`),
    import(`${miloLibs}/utils/utils.js`),
    import(`${miloLibs}/features/spectrum-web-components/dist/theme.js`),
    import(`${miloLibs}/features/spectrum-web-components/dist/progress-circle.js`),
  ]);

  const blockConfig = readBlockConfig(el);
  const scheduleId = blockConfig?.['schedule-id'];
  let staticSchedule;

  if (blockConfig?.schedule) {
    try {
      staticSchedule = JSON.parse((blockConfig?.schedule));
    } catch (e) {
      window.lana?.log(`Error parsing static schedule: ${JSON.stringify(e)}`);
    }
  }
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
    window.lana?.log(`Error creating worker: ${JSON.stringify(error)}`);
    el.innerHTML = '<div class="error-message">Unable to initialize timing system. Please refresh the page.</div>';
    el.classList.add('error');
    return Promise.resolve();
  }

  // Create a promise that resolves when the first message is received
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      window.lana?.log('Timeout waiting for first worker message, continuing without CLS prevention');
      
      // Clean up blob URL if it was used
      if (worker._blobUrl) {
        URL.revokeObjectURL(worker._blobUrl);
        worker._blobUrl = null;
      }
      
      resolve(); // resolve the promise without waiting for the first message
    }, 3000); // 3 second timeout - balances CLS prevention with LCP/FCP

    // Set up the message handler that resolves the promise
    worker.onmessage = (event) => {
      clearTimeout(timeout);

      const { pathToFragment } = event.data;
      const { prefix } = getLocale(getConfig().locales);
      el.style.height = `${el.clientHeight}px`;

      // load sp progress circle
      const spTheme = createTag('sp-theme', { color: 'light', scale: 'medium', class: 'loading-screen' });
      createTag('sp-progress-circle', { size: 'l', indeterminate: true }, '', { parent: spTheme });
      el.innerHTML = '';
      el.classList.add('loading');
      el.append(spTheme);

      const a = createTag('a', { href: `${prefix}${pathToFragment}` }, '', { parent: el });

      loadFragment(a).then(() => {
        // set el height to current height
        spTheme.remove();
        el.removeAttribute('style');
        el.classList.remove('loading');
      }).catch((error) => {
        // Handle fragment loading errors
        window.lana?.log(`Error loading fragment ${pathToFragment}: ${JSON.stringify(error)}`);

        // Remove loading state
        spTheme.remove();
        el.removeAttribute('style');
        el.classList.remove('loading');

        // Show error state to user
        el.innerHTML = '<div class="error-message">Unable to load content. Please refresh the page.</div>';
        el.classList.add('error');
      });

      // Clean up blob URL if it was used
      if (worker._blobUrl) {
        URL.revokeObjectURL(worker._blobUrl);
        worker._blobUrl = null;
      }

      // Resolve the promise
      resolve();
    };
  });
}
