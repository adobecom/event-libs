export default class TestingManager {
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
        window.lana?.log(`Invalid serverTime provided for testing: ${testingData.serverTime}`);
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
        window.lana?.log(`Invalid toggleTime provided for testing: ${testingData.toggleTime}`);
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
