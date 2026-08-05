import { expect } from '@esm-bundle/chai';
import {
  setDaToken,
  setDaFetch,
  listEventFolders,
  listFolder,
  syncSchedules,
  decodeScheduleParam,
} from '../../../event-libs/schedule-maker/scripts/da-controller.js';

// A minimal fetch Response stand-in. `headers.get` is case-insensitive to
// match the real Headers behavior the controller relies on.
function makeResponse({
  ok = true, status = 200, json, text = '', headers = {},
} = {}) {
  const entries = Object.entries(headers);
  if (json !== undefined && !('content-type' in headers)) {
    entries.push(['content-type', 'application/json']);
  }
  return {
    ok,
    status,
    statusText: `status ${status}`,
    headers: {
      get: (name) => {
        const lower = name.toLowerCase();
        const found = entries.find(([k]) => k.toLowerCase() === lower);
        return found ? found[1] : null;
      },
    },
    json: async () => json,
    text: async () => (json !== undefined ? JSON.stringify(json) : text),
  };
}

// Routes a request to the first pattern whose substring appears in the URL.
// Each route value is a Response or a (url, options) => Response function.
function routeFetch(routes) {
  const calls = [];
  const fn = async (url, options) => {
    calls.push({ url, options });
    const match = routes.find(([pattern]) => url.includes(pattern));
    if (!match) return makeResponse({ ok: false, status: 404, statusText: 'not found' });
    const [, resp] = match;
    return typeof resp === 'function' ? resp(url, options) : resp;
  };
  fn.calls = calls;
  return fn;
}

function encodeSchedule(schedule) {
  return btoa(JSON.stringify(schedule));
}

describe('da-controller', () => {
  beforeEach(() => {
    setDaToken('test-token');
  });

  afterEach(() => {
    setDaFetch(null);
    setDaToken(null);
  });

  describe('decodeScheduleParam', () => {
    it('decodes a single-encoded base64 schedule', () => {
      const raw = encodeSchedule({ scheduleId: 's1', title: 'T', blocks: [] });
      const decoded = decodeScheduleParam(raw);
      expect(decoded.scheduleId).to.equal('s1');
    });

    it('decodes a URL-encoded (double-encoded) schedule', () => {
      const base = encodeSchedule({ scheduleId: 's2', blocks: [] });
      const raw = encodeURIComponent(encodeURIComponent(base));
      const decoded = decodeScheduleParam(raw);
      expect(decoded.scheduleId).to.equal('s2');
    });

    it('accepts a schedule identified only by a blocks array', () => {
      const raw = encodeSchedule({ blocks: [{ title: 'x' }] });
      const decoded = decodeScheduleParam(raw);
      expect(decoded.blocks).to.have.lengthOf(1);
    });

    it('returns null for values that are not decodable schedules', () => {
      expect(decodeScheduleParam('not-base64!!')).to.equal(null);
      expect(decodeScheduleParam(btoa(JSON.stringify({ foo: 'bar' })))).to.equal(null);
    });
  });

  describe('listEventFolders', () => {
    it('returns only folders (items without an extension)', async () => {
      setDaFetch(routeFetch([
        ['/list/org/repo', makeResponse({
          json: [
            { path: '/org/repo/event-a', name: 'event-a' },
            { path: '/org/repo/readme.html', name: 'readme', ext: 'html' },
            { path: '/org/repo/event-b', name: 'event-b' },
          ],
        })],
      ]));
      const result = await listEventFolders('org', 'repo');
      expect(result.ok).to.be.true;
      expect(result.data.map((f) => f.name)).to.deep.equal(['event-a', 'event-b']);
    });

    it('propagates a failed request', async () => {
      setDaFetch(routeFetch([
        ['/list/org/repo', makeResponse({ ok: false, status: 500, text: 'boom' })],
      ]));
      const result = await listEventFolders('org', 'repo');
      expect(result.ok).to.be.false;
      expect(result.status).to.equal(500);
    });

    it('returns a network-error result when fetch throws', async () => {
      setDaFetch(async () => { throw new Error('offline'); });
      const result = await listEventFolders('org', 'repo');
      expect(result.ok).to.be.false;
      expect(result.status).to.equal(0);
      expect(result.error).to.equal('Network error');
    });
  });

  describe('listFolder', () => {
    it('sorts folders before files, then alphabetically by path', async () => {
      setDaFetch(routeFetch([
        ['/list/org/repo/base', makeResponse({
          json: [
            { path: '/z-file.html', ext: 'html' },
            { path: '/b-folder' },
            { path: '/a-file.html', ext: 'html' },
            { path: '/a-folder' },
          ],
        })],
      ]));
      const result = await listFolder('org', 'repo', '/base');
      expect(result.ok).to.be.true;
      expect(result.data.map((i) => i.path)).to.deep.equal([
        '/a-folder',
        '/b-folder',
        '/a-file.html',
        '/z-file.html',
      ]);
    });
  });

  describe('syncSchedules', () => {
    it('scans HTML docs and returns unique schedules with doc references', async () => {
      const schedule = {
        scheduleId: 's1',
        title: 'Main Stage',
        modificationTime: '2026-06-01T00:00:00.000Z',
        blocks: [],
      };
      const encoded = encodeSchedule(schedule);
      const docHtml = `<a href="https://da.live/app/o/r/tools?schedule=${encoded}">link</a>`;

      setDaFetch(routeFetch([
        ['/list/org/repo/events/my-event', makeResponse({
          json: [{ path: '/org/repo/events/my-event/index.html', ext: 'html' }],
        })],
        ['/source/org/repo/events/my-event/index.html', makeResponse({ text: docHtml })],
      ]));

      const result = await syncSchedules('org', 'repo', '/events/my-event');
      expect(result.ok).to.be.true;
      expect(result.data.schedules).to.have.lengthOf(1);
      expect(result.data.schedules[0].scheduleId).to.equal('s1');
      expect(result.data.docRefs.s1).to.deep.equal(['/events/my-event/index.html']);
    });

    it('deduplicates a schedule referenced by multiple docs and sorts by recency', async () => {
      const older = encodeSchedule({ scheduleId: 'old', title: 'Old', modificationTime: '2026-01-01T00:00:00.000Z', blocks: [] });
      const newer = encodeSchedule({ scheduleId: 'new', title: 'New', modificationTime: '2026-06-01T00:00:00.000Z', blocks: [] });

      setDaFetch(routeFetch([
        ['/list/org/repo/events/e', makeResponse({
          json: [
            { path: '/org/repo/events/e/a.html', ext: 'html' },
            { path: '/org/repo/events/e/b.html', ext: 'html' },
          ],
        })],
        ['/source/org/repo/events/e/a.html', makeResponse({ text: `<a href="?schedule=${older}">o</a><a href="?schedule=${newer}">n</a>` })],
        ['/source/org/repo/events/e/b.html', makeResponse({ text: `<a href="?schedule=${newer}">n</a>` })],
      ]));

      const result = await syncSchedules('org', 'repo', '/events/e');
      expect(result.ok).to.be.true;
      expect(result.data.schedules.map((s) => s.scheduleId)).to.deep.equal(['new', 'old']);
      expect(result.data.docRefs.new).to.have.lengthOf(2);
      expect(result.data.docRefs.old).to.deep.equal(['/events/e/a.html']);
    });

    it('recurses into subfolders when listing files', async () => {
      const encoded = encodeSchedule({ scheduleId: 'deep', title: 'Deep', modificationTime: '2026-06-01T00:00:00.000Z', blocks: [] });
      setDaFetch(routeFetch([
        ['/list/org/repo/events/e/sub', makeResponse({
          json: [{ path: '/org/repo/events/e/sub/page.html', ext: 'html' }],
        })],
        ['/list/org/repo/events/e', makeResponse({
          json: [{ path: '/org/repo/events/e/sub' }],
        })],
        ['/source/org/repo/events/e/sub/page.html', makeResponse({ text: `<a href="?schedule=${encoded}">x</a>` })],
      ]));

      const result = await syncSchedules('org', 'repo', '/events/e');
      expect(result.ok).to.be.true;
      expect(result.data.schedules[0].scheduleId).to.equal('deep');
      expect(result.data.docRefs.deep).to.deep.equal(['/events/e/sub/page.html']);
    });

    it('normalizes an event folder given without a leading slash', async () => {
      setDaFetch(routeFetch([
        ['/list/org/repo/events/e', makeResponse({ json: [] })],
      ]));
      const result = await syncSchedules('org', 'repo', 'events/e');
      expect(result.ok).to.be.true;
      expect(result.data.schedules).to.deep.equal([]);
    });

    it('aborts with a 401 when listing hits an auth error', async () => {
      setDaFetch(routeFetch([
        ['/list/org/repo/events/e', makeResponse({ ok: false, status: 401, text: 'unauthorized' })],
      ]));
      const result = await syncSchedules('org', 'repo', '/events/e');
      expect(result.ok).to.be.false;
      expect(result.status).to.equal(401);
      expect(result.error).to.include('sign in');
    });

    it('aborts with a 503 when a document cannot be read', async () => {
      setDaFetch(routeFetch([
        ['/list/org/repo/events/e', makeResponse({
          json: [{ path: '/org/repo/events/e/index.html', ext: 'html' }],
        })],
        // 403 is non-retriable, so fetchText fails immediately (no backoff delay).
        ['/source/org/repo/events/e/index.html', makeResponse({ ok: false, status: 403, text: 'forbidden' })],
      ]));
      const result = await syncSchedules('org', 'repo', '/events/e');
      expect(result.ok).to.be.false;
      expect(result.status).to.equal(503);
      expect(result.error).to.include('could not be read');
    });

    it('treats a 404 document as empty rather than unreadable', async () => {
      setDaFetch(routeFetch([
        ['/list/org/repo/events/e', makeResponse({
          json: [{ path: '/org/repo/events/e/gone.html', ext: 'html' }],
        })],
        ['/source/org/repo/events/e/gone.html', makeResponse({ ok: false, status: 404 })],
      ]));
      const result = await syncSchedules('org', 'repo', '/events/e');
      expect(result.ok).to.be.true;
      expect(result.data.schedules).to.deep.equal([]);
    });

    it('ignores docs that contain no schedule links', async () => {
      setDaFetch(routeFetch([
        ['/list/org/repo/events/e', makeResponse({
          json: [{ path: '/org/repo/events/e/plain.html', ext: 'html' }],
        })],
        ['/source/org/repo/events/e/plain.html', makeResponse({ text: '<p>no links here</p>' })],
      ]));
      const result = await syncSchedules('org', 'repo', '/events/e');
      expect(result.ok).to.be.true;
      expect(result.data.schedules).to.deep.equal([]);
    });
  });
});
