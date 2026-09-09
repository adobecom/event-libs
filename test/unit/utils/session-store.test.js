import { expect } from '@esm-bundle/chai';
import {
  openSessionGuideDetail, sessionGuideRequest, requestWatchSameSession, watchSameSessionRequest,
} from '../../../event-libs/v1/utils/session-store.js';

describe('openSessionGuideDetail', () => {
  afterEach(() => {
    sessionGuideRequest.value = null;
  });

  it('sets sessionGuideRequest with the given sessionId', () => {
    openSessionGuideDetail('session-1');
    expect(sessionGuideRequest.value).to.deep.equal({ sessionId: 'session-1' });
  });

  it('notifies subscribers on repeat calls for the same sessionId', () => {
    const seen = [];
    const unsubscribe = sessionGuideRequest.subscribe((value) => seen.push(value));
    openSessionGuideDetail('session-1');
    openSessionGuideDetail('session-1');
    unsubscribe();
    // First notification is the subscribe-time current value (null), then one per call.
    expect(seen).to.have.lengthOf(3);
    expect(seen[1]).to.deep.equal({ sessionId: 'session-1' });
    expect(seen[2]).to.deep.equal({ sessionId: 'session-1' });
    expect(seen[1]).to.not.equal(seen[2]);
  });
});

// Opposite direction of openSessionGuideDetail: the widget asking an already-mounted page
// (e.g. Broadcast) to switch instead of navigating. No-ops on pages with nothing subscribed,
// which this test can't observe directly — it only asserts the signal itself updates.
describe('requestWatchSameSession', () => {
  afterEach(() => {
    watchSameSessionRequest.value = null;
  });

  it('sets watchSameSessionRequest with the given sessionId', () => {
    requestWatchSameSession('session-1');
    expect(watchSameSessionRequest.value).to.deep.equal({ sessionId: 'session-1' });
  });

  it('notifies subscribers on repeat calls for the same sessionId', () => {
    const seen = [];
    const unsubscribe = watchSameSessionRequest.subscribe((value) => seen.push(value));
    requestWatchSameSession('session-1');
    requestWatchSameSession('session-1');
    unsubscribe();
    expect(seen).to.have.lengthOf(3);
    expect(seen[1]).to.deep.equal({ sessionId: 'session-1' });
    expect(seen[2]).to.deep.equal({ sessionId: 'session-1' });
    expect(seen[1]).to.not.equal(seen[2]);
  });
});
