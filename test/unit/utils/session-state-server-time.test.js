import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setSessionsParam, setSessionParam } from '../../../event-libs/v1/c2/blocks/sessions-guide/utils/url.js';
import { readWatchParam, stripWatchParam } from '../../../event-libs/v1/c2/blocks/session-broadcast/utils/broadcast-url.js';
import { isSessionLiveNow } from '../../../event-libs/v1/c2/blocks/session-broadcast/utils/broadcast-schedule.js';

// getNowMs()'s SERVER_TIME_ORIGIN is captured once, at session-state.js's first import in the
// whole @web/test-runner session, from window.location.search at that instant — other test
// files (and source files) may have already imported the plain, non-cache-busted URL by the
// time this file runs. Cache-bust so this file always gets its own fresh instance that reads
// whatever ?serverTime= this file itself sets, regardless of load order.
const basePath = window.location.pathname;

describe('session-state: getNowMs / ?serverTime=', () => {
  let clock;

  afterEach(() => {
    clock?.restore();
    clock = undefined;
    history.replaceState(null, '', basePath);
  });

  it('uses the real (fake-timer) clock when no serverTime param is present', async () => {
    history.replaceState(null, '', basePath);
    clock = sinon.useFakeTimers({ now: 1_700_000_000_000 });
    const { getNowMs } = await import(`../../../event-libs/v1/utils/session-state.js?t=${Math.random()}`);

    expect(getNowMs()).to.equal(1_700_000_000_000);
    clock.tick(5000);
    expect(getNowMs()).to.equal(1_700_000_005_000);
  });

  it('originates from the serverTime param, then keeps advancing rather than freezing', async () => {
    const simulatedOrigin = 1_800_000_000_000;
    history.replaceState(null, '', `${basePath}?serverTime=${simulatedOrigin}`);
    clock = sinon.useFakeTimers({ now: 1_700_000_000_000 });
    const { getNowMs } = await import(`../../../event-libs/v1/utils/session-state.js?t=${Math.random()}`);

    expect(getNowMs()).to.equal(simulatedOrigin);
    clock.tick(10_000);
    expect(getNowMs()).to.equal(simulatedOrigin + 10_000);
  });

  it('falls back to the real clock for a non-numeric serverTime value', async () => {
    history.replaceState(null, '', `${basePath}?serverTime=not-a-number`);
    clock = sinon.useFakeTimers({ now: 1_700_000_000_000 });
    const { getNowMs } = await import(`../../../event-libs/v1/utils/session-state.js?t=${Math.random()}`);

    expect(getNowMs()).to.equal(1_700_000_000_000);
  });

  it('keeps a session live on broadcast after the source clock crosses its start boundary', async () => {
    const simulatedOrigin = 1_794_339_000_000;
    history.replaceState(null, '', `/max-new.html?serverTime=${simulatedOrigin}`);
    clock = sinon.useFakeTimers({ now: 1_700_000_000_000 });
    const source = await import(`../../../event-libs/v1/utils/session-state.js?t=${Math.random()}`);
    const session = {
      id: 's1',
      isOnline: true,
      startTimeUtc: new Date(simulatedOrigin + 60_000).toISOString(),
      endTimeUtc: new Date(simulatedOrigin + 3_600_000).toISOString(),
    };
    expect(source.deriveSessionState(session, new Set(), source.getNowMs())).to.equal('upcoming');

    history.replaceState(null, '', setSessionsParam());
    history.replaceState(null, '', setSessionParam('live-session'));
    clock.tick(70_000);
    const navigationMs = simulatedOrigin + 70_000;
    expect(source.deriveSessionState(session, new Set(), source.getNowMs())).to.equal('live');
    const destination = source.getWatchDestination(session, 'live');
    expect(destination).to.equal(`/max/2026/broadcast.html?watch=s1&serverTime=${navigationMs}`);

    history.replaceState(null, '', destination);
    expect(readWatchParam()).to.equal('s1');
    stripWatchParam('s1');
    expect(window.location.search).to.equal(`?serverTime=${navigationMs}`);
    const { getNowMs } = await import(`../../../event-libs/v1/utils/session-state.js?t=${Math.random()}`);
    expect(getNowMs()).to.equal(navigationMs);
    expect(isSessionLiveNow(session, new Set(), getNowMs())).to.be.true;
    clock.tick(5000);
    expect(getNowMs()).to.equal(navigationMs + 5000);
  });
});
