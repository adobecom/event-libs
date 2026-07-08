import { expect } from '@esm-bundle/chai';
import { startPolling, stopPolling } from '../../../../../event-libs/v1/services/sessions/poller.js';

describe('services/poller', () => {
  let updates;

  beforeEach(() => {
    updates = [];
    stopPolling();
  });

  afterEach(() => {
    stopPolling();
  });

  it('startPolling returns null for empty mrSessions', () => {
    const id = startPolling([], 'dev', () => {}, 100);
    expect(id).to.be.null;
  });

  it('startPolling calls onUpdate with active/inactive Sets on first tick', async () => {
    const mrSessions = [{ mrStreamId: 'mr-123' }];
    startPolling(mrSessions, 'dev', (active, inactive) => updates.push({ active, inactive }), 60_000);
    // Allow microtasks to flush (tick is async)
    await new Promise((r) => setTimeout(r, 50));
    expect(updates.length).to.be.at.least(1);
    expect(updates[0].active).to.be.instanceOf(Set);
    expect(updates[0].inactive).to.be.instanceOf(Set);
  });

  it('stopPolling clears the interval', async () => {
    const mrSessions = [{ mrStreamId: 'mr-456' }];
    startPolling(mrSessions, 'dev', () => updates.push(1), 100);
    // Wait for the initial async tick to complete before stopping
    await new Promise((r) => setTimeout(r, 50));
    stopPolling();
    const countAfterStop = updates.length;
    // Wait longer than the interval to confirm no more updates occur
    await new Promise((r) => setTimeout(r, 200));
    expect(updates.length).to.equal(countAfterStop);
  });
});
