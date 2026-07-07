import { expect } from '@esm-bundle/chai';
import { injectDispatch, startPolling, stopPolling } from '../../../../../event-libs/v1/blocks/sessions-guide/services/poller.js';

describe('services/poller', () => {
  let dispatched;

  beforeEach(() => {
    dispatched = [];
    injectDispatch((action) => dispatched.push(action));
    stopPolling();
  });

  afterEach(() => {
    stopPolling();
    injectDispatch(null);
  });

  it('startPolling returns null for empty mrSessions', () => {
    const id = startPolling([], 'dev', 100);
    expect(id).to.be.null;
  });

  it('startPolling dispatches LIVE_STATUS_UPDATE on first tick', async () => {
    const mrSessions = [{ mrStreamId: 'mr-123' }];
    startPolling(mrSessions, 'dev', 60_000);
    // Allow microtasks to flush (tick is async)
    await new Promise((r) => setTimeout(r, 50));
    expect(dispatched.length).to.be.at.least(1);
    expect(dispatched[0].type).to.equal('LIVE_STATUS_UPDATE');
  });

  it('stopPolling clears the interval', async () => {
    const mrSessions = [{ mrStreamId: 'mr-456' }];
    startPolling(mrSessions, 'dev', 100);
    // Wait for the initial async tick to complete before stopping
    await new Promise((r) => setTimeout(r, 50));
    stopPolling();
    const countAfterStop = dispatched.length;
    // Wait longer than the interval to confirm no more dispatches occur
    await new Promise((r) => setTimeout(r, 200));
    expect(dispatched.length).to.equal(countAfterStop);
  });

  it('injectDispatch with null prevents dispatching', async () => {
    injectDispatch(null);
    const mrSessions = [{ mrStreamId: 'mr-789' }];
    startPolling(mrSessions, 'dev', 60_000);
    await new Promise((r) => setTimeout(r, 50));
    expect(dispatched.length).to.equal(0);
  });
});
