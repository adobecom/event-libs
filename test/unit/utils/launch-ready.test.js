/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { waitForLaunch, resetLaunchWait } from '../../../event-libs/v1/utils/launch-ready.js';

const tick = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

describe('launch-ready: waitForLaunch', () => {
  let originalUrl;

  beforeEach(() => {
    originalUrl = window.location.href;
    delete window._satellite;
    document.head.innerHTML = '';
    resetLaunchWait();
  });

  afterEach(() => {
    window.history.replaceState({}, '', originalUrl);
    delete window._satellite;
    document.head.innerHTML = '';
    resetLaunchWait();
  });

  it('resolves true immediately when Launch is already loaded', async () => {
    window._satellite = { track: () => {} };
    expect(await waitForLaunch(10)).to.be.true;
  });

  it('resolves true once Launch loads', async () => {
    const promise = waitForLaunch(2000);
    await tick(60);
    window._satellite = { track: () => {} };
    expect(await promise).to.be.true;
  });

  it('resolves false after the timeout when Launch never loads', async () => {
    const start = Date.now();
    expect(await waitForLaunch(120)).to.be.false;
    expect(Date.now() - start).to.be.at.least(100);
  });

  it('does not re-wait after a timeout', async () => {
    await waitForLaunch(60);
    const start = Date.now();
    expect(await waitForLaunch(2000)).to.be.false;
    expect(Date.now() - start).to.be.below(30);
  });

  it('shares one wait across concurrent callers', () => {
    expect(waitForLaunch(500)).to.equal(waitForLaunch(500));
  });

  it('ignores a _satellite without track()', async () => {
    window._satellite = {};
    expect(await waitForLaunch(60)).to.be.false;
  });

  it('resolves false immediately when martech=off is in the URL', async () => {
    window.history.replaceState({}, '', `${window.location.pathname}?martech=off`);
    const start = Date.now();
    expect(await waitForLaunch(2000)).to.be.false;
    expect(Date.now() - start).to.be.below(30);
  });

  it('resolves false immediately when martech metadata is off', async () => {
    document.head.innerHTML = '<meta name="martech" content="off">';
    expect(await waitForLaunch(2000)).to.be.false;
  });
});
