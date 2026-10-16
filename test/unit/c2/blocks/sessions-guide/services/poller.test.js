import { expect } from '@esm-bundle/chai';
import { startPolling, stopPolling } from '../../../../../../event-libs/v1/services/sessions/poller.js';

describe('services/poller', () => {
  let updates;
  let originalFetch;

  beforeEach(() => {
    updates = [];
    stopPolling();
    // Each tick now makes a real fetchLiveStatus() call to Mobile Rider's batch
    // media-status endpoint — stub it so ticks resolve deterministically without
    // hitting the network (unit tests disallow external fetches).
    originalFetch = window.fetch;
    window.fetch = async () => new Response(JSON.stringify({ active: [], inactive: [] }));
  });

  afterEach(() => {
    stopPolling();
    window.fetch = originalFetch;
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

  it('still reports the live streams when one stream id is unknown to Mobile Rider', async () => {
    const requests = [];
    window.fetch = async (url) => {
      const ids = new URL(url).searchParams.get('ids').split(',');
      requests.push(ids);
      if (ids.includes('pl-bad')) {
        return new Response(JSON.stringify({ success: false, message: 'ID pl-bad not found in JSON data.' }), { status: 404 });
      }
      return new Response(JSON.stringify({ active: ['pl-live'], inactive: ids.filter((id) => id !== 'pl-live') }));
    };

    startPolling(
      [{ mrStreamId: 'pl-live' }, { mrStreamId: 'pl-bad' }, { mrStreamId: 'pl-later' }],
      'dev',
      (active, inactive) => updates.push({ active, inactive }),
      60_000,
    );
    await new Promise((r) => setTimeout(r, 100));

    expect(requests.length).to.equal(2);
    expect(updates.length).to.equal(1);
    expect([...updates[0].active]).to.deep.equal(['pl-live']);
    expect([...updates[0].inactive].sort()).to.deep.equal(['pl-bad', 'pl-later']);
  });

  describe('when every stream is inactive', () => {
    const HOUR_MS = 3_600_000;
    const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
    let live;

    beforeEach(() => {
      live = new Set();
      window.fetch = async (url) => {
        const ids = new URL(url).searchParams.get('ids').split(',');
        return new Response(JSON.stringify({
          active: ids.filter((id) => live.has(id)),
          inactive: ids.filter((id) => !live.has(id)),
        }));
      };
    });

    it('keeps polling before the sessions end, so a stream going live is picked up', async () => {
      const mrSessions = [
        { mrStreamId: 'up-keynote', startTimeUtc: iso(HOUR_MS), endTimeUtc: iso(2 * HOUR_MS) },
      ];
      startPolling(mrSessions, 'dev', (active) => updates.push(active), 40);
      await new Promise((r) => setTimeout(r, 60));
      expect(updates.length).to.be.at.least(1);
      expect(updates[0].size).to.equal(0);

      live.add('up-keynote');
      await new Promise((r) => setTimeout(r, 120));
      expect(updates.some((active) => active.has('up-keynote'))).to.be.true;
    });

    it('keeps polling when a session has no parseable end time', async () => {
      startPolling([{ mrStreamId: 'no-end' }], 'dev', () => updates.push(1), 40);
      await new Promise((r) => setTimeout(r, 150));
      expect(updates.length).to.be.at.least(2);
    });

    it('stops polling once every session has ended', async () => {
      const mrSessions = [
        { mrStreamId: 'done-1', startTimeUtc: iso(-3 * HOUR_MS), endTimeUtc: iso(-2 * HOUR_MS) },
        { mrStreamId: 'done-2', startTimeUtc: iso(-2 * HOUR_MS), endTimeUtc: iso(-HOUR_MS) },
      ];
      startPolling(mrSessions, 'dev', () => updates.push(1), 40);
      await new Promise((r) => setTimeout(r, 150));
      expect(updates.length).to.equal(1);
    });
  });
});
