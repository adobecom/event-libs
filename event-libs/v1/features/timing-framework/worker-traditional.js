// Keep in sync with testing.js (classic worker cannot import ES modules)
class TestingManager {
  constructor() {
    this.timeOffset = 0;
    this.isTestMode = false;
    this.isFrozenTime = false;
    this.avoidStreamEndFlag = false;
  }

  init(testingData) {
    // Reset state
    this.isTestMode = false;
    this.isFrozenTime = false;
    this.timeOffset = 0;
    this.avoidStreamEndFlag = false;

    if (!testingData) return;

    // Handle avoidStreamEndFlag parameter
    if (testingData.avoidStreamEndFlag === 'true' || testingData.avoidStreamEndFlag === true) {
      this.avoidStreamEndFlag = true;
      this.isTestMode = true;
    }

    // Handle serverTime parameter (non-frozen time starting at specific timestamp)
    if (testingData.serverTime) {
      const serverTime = parseInt(testingData.serverTime, 10);

      if (!Number.isNaN(serverTime) && Number.isFinite(serverTime)) {
        this.isTestMode = true;
        this.isFrozenTime = false;
        const currentTime = new Date().getTime();
        this.timeOffset = serverTime - currentTime;
      } else {
        // Use console.log instead of window.lana in worker context
        console.log(`Invalid serverTime provided for testing: ${testingData.serverTime}`);
      }
    }

    // Handle toggleTime parameter (frozen time at specific timestamp)
    // This takes precedence over serverTime if both are provided
    if (testingData.toggleTime) {
      const toggleTime = parseInt(testingData.toggleTime, 10);

      if (!Number.isNaN(toggleTime) && Number.isFinite(toggleTime)) {
        this.isTestMode = true;
        this.isFrozenTime = true;
        const currentTime = new Date().getTime();
        this.timeOffset = toggleTime - currentTime;
      } else {
        // Use console.log instead of window.lana in worker context
        console.log(`Invalid toggleTime provided for testing: ${testingData.toggleTime}`);
      }
    }
  }

  adjustTime(currentTime) {
    return currentTime + this.timeOffset;
  }

  isTesting() {
    return this.isTestMode;
  }

  isFrozen() {
    return this.isFrozenTime;
  }

  shouldAvoidStreamEnd() {
    return this.avoidStreamEndFlag;
  }
}

class TimingWorker {
  constructor() {
    this.tabId = null;
    this.plugins = new Map();
    this.channels = new Map();
    this.timerId = null;
    this.currentScheduleItem = null;
    this.nextScheduleItem = null;
    this.previouslySentItem = null;
    this.testingManager = new TestingManager();

    // Time management — keep aligned with worker.js
    this.cachedApiTime = null;
    this.lastApiCallPerformance = 0;
    this.apiCallInterval = 300000; // 5 minutes minimum between API calls
    this.cacheTtl = 600000; // 10 minutes cache TTL
    this.consecutiveFailures = 0;
    this.maxFailures = 3;
    this.backoffMultiplier = 2;
    this.maxBackoffInterval = 1800000; // 30 minutes max backoff
    this.maxAllowedDrift = 60000; // 1 minute max drift before cache invalidation

    this.setupMessageHandler();
  }

  setupBroadcastChannels(plugins) {
    this.channels.forEach((channel) => {
      try {
        if (channel && typeof channel.close === 'function') {
          channel.close();
        }
      } catch {
        // Ignore cleanup errors - non-critical
      }
    });
    this.channels.clear();

    const createPluginChannel = (channelName, pluginName, messageHandler) => {
      try {
        const channel = new BroadcastChannel(channelName);
        channel.onmessage = (event) => {
          const { tabId } = event.data;
          if (tabId === this.tabId) {
            const store = this.plugins.get(pluginName);
            if (store) {
              messageHandler(event.data, store);
            }
          }
        };
        this.channels.set(pluginName, channel);
      } catch {
        // BroadcastChannel not supported or failed - cross-tab sync disabled
      }
    };

    if (plugins.has('metadata')) {
      createPluginChannel('metadata-store', 'metadata', (data, store) => {
        store.set(data.key, data.value);
      });
    }

    if (plugins.has('mobileRider')) {
      createPluginChannel('mobile-rider-store', 'mobileRider', (data, store) => {
        store.set(data.sessionId, data.isActive);
      });
    }

    try {
      const timeChannel = new BroadcastChannel('time-cache-store');
      timeChannel.onmessage = (event) => {
        const { type, data } = event.data;
        if (type === 'time-update' && data) {
          const now = Date.now();
          const age = now - data.timestamp;

          if (age < this.cacheTtl && age >= 0) {
            if (data.performanceTimestamp !== undefined) {
              this.cachedApiTime = {
                time: data.time + age,
                timestamp: now,
                performanceTimestamp: performance.now(),
              };
              this.consecutiveFailures = 0;
            }
          }
        }
      };
      this.channels.set('timeCache', timeChannel);
    } catch {
      // BroadcastChannel not supported or failed - cross-tab time sync disabled
    }
  }

  getCachedTimeWithElapsed() {
    const elapsedMs = performance.now() - this.cachedApiTime.performanceTimestamp;
    return this.cachedApiTime.time + elapsedMs;
  }

  static parseToggleTime(toggleTime) {
    return typeof toggleTime === 'string' ? parseInt(toggleTime, 10) : toggleTime;
  }

  static async getCurrentTimeFromAPI() {
    try {
      const response = await fetch('https://time.akamai.com/');
      const data = await response.text();
      return Number.parseInt(data, 10) * 1000;
    } catch {
      return null;
    }
  }

  async getAuthoritativeTime() {
    const now = Date.now();
    const perfNow = performance.now();

    if (this.testingManager.isTesting()) {
      return now;
    }

    if (this.cachedApiTime) {
      const wallClockElapsed = now - this.cachedApiTime.timestamp;
      const monotonicElapsed = perfNow - this.cachedApiTime.performanceTimestamp;
      const drift = Math.abs(wallClockElapsed - monotonicElapsed);

      if (drift > this.maxAllowedDrift) {
        this.cachedApiTime = null;
      }
    }

    if (this.cachedApiTime && (now - this.cachedApiTime.timestamp) < this.cacheTtl) {
      return this.getCachedTimeWithElapsed();
    }

    const backoffInterval = Math.min(
      this.apiCallInterval * (this.backoffMultiplier ** this.consecutiveFailures),
      this.maxBackoffInterval,
    );

    const jitter = Math.random() * 0.3 * backoffInterval;
    const effectiveInterval = backoffInterval + jitter;

    const timeSinceLastCall = this.lastApiCallPerformance > 0
      ? perfNow - this.lastApiCallPerformance
      : Infinity;

    if (timeSinceLastCall < effectiveInterval) {
      return this.cachedApiTime ? this.getCachedTimeWithElapsed() : now;
    }

    try {
      const apiTime = await TimingWorker.getCurrentTimeFromAPI();
      this.lastApiCallPerformance = perfNow;

      if (apiTime !== null) {
        this.cachedApiTime = {
          time: apiTime,
          timestamp: now,
          performanceTimestamp: perfNow,
        };
        this.consecutiveFailures = 0;

        try {
          const timeChannel = this.channels.get('timeCache');
          if (timeChannel) {
            timeChannel.postMessage({
              type: 'time-update',
              data: this.cachedApiTime,
            });
          }
        } catch {
          // Broadcasting failed - not critical
        }

        return apiTime;
      }
      this.consecutiveFailures = Math.min(this.consecutiveFailures + 1, this.maxFailures);
    } catch {
      this.consecutiveFailures = Math.min(this.consecutiveFailures + 1, this.maxFailures);
    }

    if (this.cachedApiTime) {
      return this.getCachedTimeWithElapsed();
    }
    return now;
  }

  getStartScheduleItemByToggleTime(scheduleRoot, currentTime) {
    const adjustedTime = this.testingManager.isTesting()
      ? this.testingManager.adjustTime(currentTime)
      : currentTime;

    let pointer = scheduleRoot;
    let start = null;

    while (pointer) {
      const { toggleTime } = pointer;
      const numericToggleTime = TimingWorker.parseToggleTime(toggleTime);
      const toggleTimePassed = typeof numericToggleTime !== 'number' || adjustedTime > numericToggleTime;

      if (!toggleTimePassed) break;

      start = pointer;
      pointer = pointer.next;
    }

    return start;
  }

  getFastInitialTime() {
    const hasRecentCache = this.cachedApiTime
      && (Date.now() - this.cachedApiTime.timestamp) < this.cacheTtl;

    if (hasRecentCache) {
      return this.getCachedTimeWithElapsed();
    }

    return Date.now();
  }

  /**
   * @returns {number}
   * @description Returns a random interval between 1 and 1.5 seconds
   */
  static getRandomInterval() {
    const min = 500;
    const max = 1500;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * @returns {number}
   * @description Returns the current time adjusted by the time offset if in test mode
   */
  async getCurrentTime() {
    const currentTime = await this.getAuthoritativeTime();
    const adjustedTime = this.testingManager.isTesting()
      ? this.testingManager.adjustTime(currentTime)
      : currentTime;

    return adjustedTime;
  }

  async hasToggleTimePassed(scheduleItem) {
    const { toggleTime } = scheduleItem;
    if (!toggleTime) return true;

    const currentTime = await this.getCurrentTime();
    const numericToggleTime = TimingWorker.parseToggleTime(toggleTime);
    return currentTime > numericToggleTime;
  }

  /**
   * @param {Object} scheduleItem
   * @returns {boolean}
   * @description Returns true if the next schedule item should be triggered based on plugins
   */
  async shouldTriggerNextSchedule(scheduleItem) {
    if (!scheduleItem) return false;
    let liveStreamEnd = false;
    // Check if previous item has mobileRider that's still active (overrun)
    if (this.currentScheduleItem?.mobileRider) {
      const mobileRiderStore = this.plugins.get('mobileRider');
      if (mobileRiderStore) {
        const { sessionId } = this.currentScheduleItem.mobileRider;
        const isActive = mobileRiderStore.get(sessionId);
        const avoidingStreamEnd = this.testingManager.shouldAvoidStreamEnd();
        const shouldTreatAsActive = avoidingStreamEnd ? false : isActive;
        if (shouldTreatAsActive) {
          return false;
        }
        if (!avoidingStreamEnd && !isActive) {
          liveStreamEnd = true;
        }
      }
    }

    if (scheduleItem.mobileRider) {
      const timePassed = await this.hasToggleTimePassed(scheduleItem);
      if (!timePassed) return false;

      const mobileRiderStore = this.plugins.get('mobileRider');
      if (mobileRiderStore) {
        const { sessionId } = scheduleItem.mobileRider;
        const isActive = mobileRiderStore.get(sessionId);
        if (!this.testingManager.shouldAvoidStreamEnd() && !isActive) {
          return true;
        }
      }
    }

    // Check metadata conditions if present
    if (scheduleItem.metadata && Array.isArray(scheduleItem.metadata)) {
      const metadataStore = this.plugins.get('metadata');
      if (metadataStore) {
        // Require all metadata conditions to be met
        const allConditionMet = scheduleItem.metadata.every(({ key, expectedValue }) => {
          const value = metadataStore.get(key);
          const isEmpty = !value
            || (Array.isArray(value) && value.length === 0)
            || (typeof value === 'object' && Object.keys(value).length === 0);
          const isAnyVal = !expectedValue && !isEmpty;
          const matchesExpectedValue = expectedValue && value === expectedValue;

          return isAnyVal || matchesExpectedValue;
        });
        return allConditionMet;
      }
    }
    if (liveStreamEnd) return true;

    return this.hasToggleTimePassed(scheduleItem);
  }

  async runTimer() {
    const shouldTrigger = await this.shouldTriggerNextSchedule(this.nextScheduleItem);

    let itemToSend = null;

    if (shouldTrigger) {
      itemToSend = this.nextScheduleItem;
      this.currentScheduleItem = { ...this.nextScheduleItem };
      this.nextScheduleItem = this.nextScheduleItem.next;
    } else {
      // If no items are triggered, send the current schedule item
      // This handles cases where mobileRider is still active or other blocking conditions
      itemToSend = this.currentScheduleItem;
    }

    // Send the item if it's different from what we previously sent
    const isSameItem = (itemToSend && this.previouslySentItem)
      && itemToSend.pathToFragment === this.previouslySentItem.pathToFragment;
    if (itemToSend && !isSameItem) {
      postMessage(itemToSend);
      this.previouslySentItem = itemToSend;
    }

    if (!this.nextScheduleItem) return;

    // Stop polling only if time is frozen (timing param) - serverTime and avoidStreamEndFlag should continue polling
    if (this.testingManager.isFrozen()) return;

    this.timerId = setTimeout(() => this.runTimer(), TimingWorker.getRandomInterval());
  }

  handleMessage(event) {
    const { schedule, plugins, testing, tabId } = event.data;

    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    // Initialize testing manager with testing data
    this.testingManager.init(testing);

    // Set the tabId from the message (required for plugin communication)
    if (!tabId) {
      throw new Error('tabId is required for worker initialization');
    }
    this.tabId = tabId;

    if (plugins) {
      // Recreate store interfaces from the data
      const pluginStores = new Map();
      Object.entries(plugins).forEach(([name, pluginInfo]) => {
        const store = new Map(Object.entries(pluginInfo.data));
        pluginStores.set(name, {
          get: (key) => store.get(key),
          set: (key, value) => store.set(key, value),
          getAll: () => Object.fromEntries(store),
        });
      });
      this.plugins = pluginStores;
      this.setupBroadcastChannels(this.plugins);
    }

    if (schedule) {
      this.initializeSchedule(schedule);
    }
  }

  async initializeSchedule(schedule) {
    const initialTime = this.getFastInitialTime();
    const startItem = this.getStartScheduleItemByToggleTime(schedule, initialTime);
    this.nextScheduleItem = startItem || schedule;
    this.currentScheduleItem = startItem?.prev || null;
    this.previouslySentItem = null;

    if (!this.nextScheduleItem) return;

    this.runTimer();

    this.validateSchedulePosition(schedule).catch(() => {
      // Validation failed - timer will still run and self-correct on next tick
    });
  }

  async validateSchedulePosition(schedule) {
    const authoritativeTime = await this.getAuthoritativeTime();
    const correctItem = this.getStartScheduleItemByToggleTime(schedule, authoritativeTime);

    if (correctItem && correctItem !== this.currentScheduleItem) {
      this.nextScheduleItem = correctItem;
    } else if (!correctItem && this.currentScheduleItem) {
      this.nextScheduleItem = schedule;
      this.currentScheduleItem = null;
      this.previouslySentItem = null;
    }
  }

  setupMessageHandler() {
    onmessage = (event) => this.handleMessage(event);
  }
}

// Initialize the worker
(() => new TimingWorker())();
