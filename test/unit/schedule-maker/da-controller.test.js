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

// Reads the HTML body a rewrite POST would have written (FormData -> Blob -> text).
async function writtenBody(options) {
  const blob = options.body.get('data');
  return blob.text();
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
      expect(result.data.schedules[0].referencedInDocs).to.deep.equal(['/events/my-event/index.html']);
    });

    it('lists a schedule referenced by multiple docs and sorts by recency', async () => {
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
      expect(result.data.schedules.find((s) => s.scheduleId === 'new').referencedInDocs).to.have.lengthOf(2);
      expect(result.data.schedules.find((s) => s.scheduleId === 'old').referencedInDocs).to.deep.equal(['/events/e/a.html']);
    });

    it('collapses identical content re-placed under the same scheduleId to one entry, keeping the most recent modificationTime', async () => {
      const first = encodeSchedule({
        scheduleId: 'dup', title: 'Keynote', modificationTime: '2026-01-01T00:00:00.000Z', blocks: [{ title: 'a' }],
      });
      const second = encodeSchedule({
        scheduleId: 'dup', title: 'Keynote', modificationTime: '2026-06-01T00:00:00.000Z', blocks: [{ title: 'a' }],
      });
      const docHtml = `<a href="?schedule=${first}">old</a><a href="?schedule=${second}">new</a>`;

      setDaFetch(routeFetch([
        ['/list/org/repo/events/e', makeResponse({
          json: [{ path: '/org/repo/events/e/index.html', ext: 'html' }],
        })],
        ['/source/org/repo/events/e/index.html', makeResponse({ text: docHtml })],
      ]));

      const result = await syncSchedules('org', 'repo', '/events/e');
      expect(result.ok).to.be.true;
      expect(result.data.schedules).to.have.lengthOf(1);
      expect(result.data.schedules[0].modificationTime).to.equal('2026-06-01T00:00:00.000Z');
      expect(result.data.schedules[0].hasConflictingVersions).to.be.false;
      expect(result.data.schedules[0].conflictingVersions).to.deep.equal([]);
      // The doc only appears once, even though it contains two links for the identical schedule.
      expect(result.data.schedules[0].referencedInDocs).to.deep.equal(['/events/e/index.html']);
    });

    it('shows genuinely different content under the same scheduleId as separate entries, each flagged as conflicting', async () => {
      const original = encodeSchedule({
        scheduleId: 'dup', title: 'Original Title', modificationTime: '2026-01-01T00:00:00.000Z', blocks: [{ title: 'a' }],
      });
      const variant = encodeSchedule({
        scheduleId: 'dup', title: 'Edited Title', modificationTime: '2026-06-01T00:00:00.000Z', blocks: [{ title: 'a' }, { title: 'b' }],
      });
      const docHtml = `<a href="?schedule=${original}">old</a><a href="?schedule=${variant}">new</a>`;

      setDaFetch(routeFetch([
        ['/list/org/repo/events/e', makeResponse({
          json: [{ path: '/org/repo/events/e/index.html', ext: 'html' }],
        })],
        ['/source/org/repo/events/e/index.html', makeResponse({ text: docHtml })],
      ]));

      const result = await syncSchedules('org', 'repo', '/events/e');
      expect(result.ok).to.be.true;
      expect(result.data.schedules).to.have.lengthOf(2);
      expect(result.data.schedules.every((s) => s.hasConflictingVersions)).to.be.true;
      // Most recently modified sorts first, but both versions are present.
      expect(result.data.schedules.map((s) => s.title)).to.deep.equal(['Edited Title', 'Original Title']);
      // Both versions live in the same doc, so both list it.
      expect(result.data.schedules.every((s) => s.referencedInDocs.includes('/events/e/index.html'))).to.be.true;
      // Each version points directly at its sibling, not just a bare flag.
      const [fresh, stale] = result.data.schedules;
      expect(fresh.conflictingVersions).to.deep.equal([{ title: 'Original Title', referencedInDocs: ['/events/e/index.html'] }]);
      expect(stale.conflictingVersions).to.deep.equal([{ title: 'Edited Title', referencedInDocs: ['/events/e/index.html'] }]);
    });

    it('scopes referencedInDocs to only the docs that actually contain that exact version', async () => {
      const stale = encodeSchedule({ scheduleId: 'dup3', title: 'Stale', modificationTime: '2026-01-01T00:00:00.000Z', blocks: [] });
      const fresh = encodeSchedule({ scheduleId: 'dup3', title: 'Fresh', modificationTime: '2026-06-01T00:00:00.000Z', blocks: [] });

      setDaFetch(routeFetch([
        ['/list/org/repo/events/e', makeResponse({
          json: [
            { path: '/org/repo/events/e/a.html', ext: 'html' },
            { path: '/org/repo/events/e/b.html', ext: 'html' },
          ],
        })],
        ['/source/org/repo/events/e/a.html', makeResponse({ text: `<a href="?schedule=${stale}">old</a>` })],
        ['/source/org/repo/events/e/b.html', makeResponse({ text: `<a href="?schedule=${fresh}">new</a>` })],
      ]));

      const result = await syncSchedules('org', 'repo', '/events/e');
      expect(result.data.schedules).to.have.lengthOf(2);
      const freshEntry = result.data.schedules.find((s) => s.title === 'Fresh');
      const staleEntry = result.data.schedules.find((s) => s.title === 'Stale');
      expect(freshEntry.referencedInDocs).to.deep.equal(['/events/e/b.html']);
      expect(staleEntry.referencedInDocs).to.deep.equal(['/events/e/a.html']);
    });

    it('does not flag unrelated schedules (different scheduleIds) as conflicting with each other', async () => {
      const a = encodeSchedule({ scheduleId: 'x', title: 'A', modificationTime: '2026-01-01T00:00:00.000Z', blocks: [] });
      const b = encodeSchedule({ scheduleId: 'y', title: 'B', modificationTime: '2026-01-01T00:00:00.000Z', blocks: [] });
      const docHtml = `<a href="?schedule=${a}">a</a><a href="?schedule=${b}">b</a>`;

      setDaFetch(routeFetch([
        ['/list/org/repo/events/e', makeResponse({
          json: [{ path: '/org/repo/events/e/index.html', ext: 'html' }],
        })],
        ['/source/org/repo/events/e/index.html', makeResponse({ text: docHtml })],
      ]));

      const result = await syncSchedules('org', 'repo', '/events/e');
      expect(result.data.schedules).to.have.lengthOf(2);
      expect(result.data.schedules.every((s) => !s.hasConflictingVersions)).to.be.true;
    });

    it('fingerprints blocks order-independently, so re-sorted-but-identical content still collapses to one entry', async () => {
      const forward = encodeSchedule({
        scheduleId: 'order1',
        title: 'T',
        modificationTime: '2026-01-01T00:00:00.000Z',
        blocks: [{ title: 'a', startDateTime: 100 }, { title: 'b', startDateTime: 200 }],
      });
      const reversed = encodeSchedule({
        scheduleId: 'order1',
        title: 'T',
        modificationTime: '2026-06-01T00:00:00.000Z',
        blocks: [{ title: 'b', startDateTime: 200 }, { title: 'a', startDateTime: 100 }],
      });
      const docHtml = `<a href="?schedule=${forward}">a</a><a href="?schedule=${reversed}">b</a>`;

      setDaFetch(routeFetch([
        ['/list/org/repo/events/e', makeResponse({
          json: [{ path: '/org/repo/events/e/index.html', ext: 'html' }],
        })],
        ['/source/org/repo/events/e/index.html', makeResponse({ text: docHtml })],
      ]));

      const result = await syncSchedules('org', 'repo', '/events/e');
      expect(result.data.schedules).to.have.lengthOf(1);
      expect(result.data.schedules[0].hasConflictingVersions).to.be.false;
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
      expect(result.data.schedules[0].referencedInDocs).to.deep.equal(['/events/e/sub/page.html']);
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

  describe('rewrite pass (non-canonical schedule links → canonical DA app #schedule=)', () => {
    const canonical = (encoded) => `https://da.live/app/org/repo/tools/da-apps/schedule-maker#schedule=${encoded}`;

    // Old ECC tool was hosted on several different domains across environments —
    // the rewrite must recognize all of them (and anything else non-canonical),
    // not just one hardcoded prod domain.
    const oldEccDomains = [
      'https://www.adobe.com/ecc/system/tools/schedule-maker',
      'https://main--ecc-milo--adobecom.aem.page/ecc/system/tools/schedule-maker',
      'https://dev--ecc-milo--adobecom.aem.live/ecc/system/tools/schedule-maker',
      'https://stage--ecc-milo--adobecom.aem.live/ecc/system/tools/schedule-maker',
    ];

    oldEccDomains.forEach((base) => {
      it(`migrates an old ECC link on ${new URL(base).hostname} (hash format) to the canonical DA app URL`, async () => {
        const encoded = encodeSchedule({ scheduleId: 's1', title: 'T', modificationTime: '2026-06-01T00:00:00.000Z', blocks: [] });
        const docHtml = `<a href="${base}#schedule=${encoded}">link</a>`;

        const fetchMock = routeFetch([
          ['/list/org/repo/events/e', makeResponse({
            json: [{ path: '/org/repo/events/e/index.html', ext: 'html' }],
          })],
          ['/source/org/repo/events/e/index.html', (url, options) => (options?.method === 'POST'
            ? makeResponse({ ok: true })
            : makeResponse({ text: docHtml, headers: { ETag: '"abc123"' } })),
          ],
        ]);
        setDaFetch(fetchMock);

        const result = await syncSchedules('org', 'repo', '/events/e');
        expect(result.ok).to.be.true;

        const write = fetchMock.calls.find((c) => c.options?.method === 'POST');
        expect(write, 'expected a rewrite POST').to.exist;
        const body = await writtenBody(write.options);
        expect(body).to.include(`href="${canonical(encoded)}"`);
      });
    });

    it('migrates an old ECC link using the old ?schedule= query format', async () => {
      const encoded = encodeSchedule({ scheduleId: 's2', title: 'T', modificationTime: '2026-06-01T00:00:00.000Z', blocks: [] });
      const docHtml = `<a href="https://www.adobe.com/ecc/system/tools/schedule-maker?schedule=${encoded}">link</a>`;

      const fetchMock = routeFetch([
        ['/list/org/repo/events/e', makeResponse({
          json: [{ path: '/org/repo/events/e/index.html', ext: 'html' }],
        })],
        ['/source/org/repo/events/e/index.html', (url, options) => (options?.method === 'POST'
          ? makeResponse({ ok: true })
          : makeResponse({ text: docHtml })),
        ],
      ]);
      setDaFetch(fetchMock);

      await syncSchedules('org', 'repo', '/events/e');

      const write = fetchMock.calls.find((c) => c.options?.method === 'POST');
      expect(write, 'expected a rewrite POST').to.exist;
      const body = await writtenBody(write.options);
      expect(body).to.include(`href="${canonical(encoded)}"`);
    });

    it('upgrades a DA-app link still using the old ?schedule= query format', async () => {
      const encoded = encodeSchedule({ scheduleId: 's3', title: 'T', modificationTime: '2026-06-01T00:00:00.000Z', blocks: [] });
      const docHtml = `<a href="https://da.live/app/org/repo/tools/da-apps/schedule-maker?schedule=${encoded}">link</a>`;

      const fetchMock = routeFetch([
        ['/list/org/repo/events/e', makeResponse({
          json: [{ path: '/org/repo/events/e/index.html', ext: 'html' }],
        })],
        ['/source/org/repo/events/e/index.html', (url, options) => (options?.method === 'POST'
          ? makeResponse({ ok: true })
          : makeResponse({ text: docHtml, headers: { ETag: '"abc123"' } })),
        ],
      ]);
      setDaFetch(fetchMock);

      const result = await syncSchedules('org', 'repo', '/events/e');
      expect(result.ok).to.be.true;

      const write = fetchMock.calls.find((c) => c.options?.method === 'POST');
      expect(write, 'expected a rewrite POST').to.exist;
      const body = await writtenBody(write.options);
      expect(body).to.include(`href="${canonical(encoded)}"`);
      expect(write.options.headers.get('If-Match')).to.equal('"abc123"');
    });

    it('migrates a DA-app link pointing at a different org/repo to the currently-synced org/repo', async () => {
      const encoded = encodeSchedule({ scheduleId: 's4', title: 'T', modificationTime: '2026-06-01T00:00:00.000Z', blocks: [] });
      const docHtml = `<a href="https://da.live/app/other-org/other-repo/tools/da-apps/schedule-maker#schedule=${encoded}">link</a>`;

      const fetchMock = routeFetch([
        ['/list/org/repo/events/e', makeResponse({
          json: [{ path: '/org/repo/events/e/index.html', ext: 'html' }],
        })],
        ['/source/org/repo/events/e/index.html', (url, options) => (options?.method === 'POST'
          ? makeResponse({ ok: true })
          : makeResponse({ text: docHtml })),
        ],
      ]);
      setDaFetch(fetchMock);

      await syncSchedules('org', 'repo', '/events/e');

      const write = fetchMock.calls.find((c) => c.options?.method === 'POST');
      expect(write, 'expected a rewrite POST').to.exist;
      const body = await writtenBody(write.options);
      expect(body).to.include(`href="${canonical(encoded)}"`);
    });

    it('drops extraneous params (e.g. ?ref=) when rebuilding a non-canonical link', async () => {
      const encoded = encodeSchedule({ scheduleId: 's5', title: 'T', modificationTime: '2026-06-01T00:00:00.000Z', blocks: [] });
      const docHtml = `<a href="https://da.live/app/org/repo/tools/da-apps/schedule-maker?ref=my-branch&schedule=${encoded}">link</a>`;

      const fetchMock = routeFetch([
        ['/list/org/repo/events/e', makeResponse({
          json: [{ path: '/org/repo/events/e/index.html', ext: 'html' }],
        })],
        ['/source/org/repo/events/e/index.html', (url, options) => (options?.method === 'POST'
          ? makeResponse({ ok: true })
          : makeResponse({ text: docHtml })),
        ],
      ]);
      setDaFetch(fetchMock);

      await syncSchedules('org', 'repo', '/events/e');

      const write = fetchMock.calls.find((c) => c.options?.method === 'POST');
      const body = await writtenBody(write.options);
      expect(body).to.include(`href="${canonical(encoded)}"`);
      expect(body).to.not.include('ref=my-branch');
    });

    it('does not rewrite a link that is already exactly canonical', async () => {
      const encoded = encodeSchedule({ scheduleId: 's6', title: 'T', modificationTime: '2026-06-01T00:00:00.000Z', blocks: [] });
      const docHtml = `<a href="${canonical(encoded)}">link</a>`;

      const fetchMock = routeFetch([
        ['/list/org/repo/events/e', makeResponse({
          json: [{ path: '/org/repo/events/e/index.html', ext: 'html' }],
        })],
        ['/source/org/repo/events/e/index.html', makeResponse({ text: docHtml })],
      ]);
      setDaFetch(fetchMock);

      const result = await syncSchedules('org', 'repo', '/events/e');
      expect(result.ok).to.be.true;
      expect(fetchMock.calls.some((c) => c.options?.method === 'POST')).to.be.false;
    });

    it('rewrites only the non-canonical link when a doc has both canonical and non-canonical links', async () => {
      const encodedOld = encodeSchedule({ scheduleId: 'old', title: 'Old', modificationTime: '2026-06-01T00:00:00.000Z', blocks: [] });
      const encodedNew = encodeSchedule({ scheduleId: 'new', title: 'New', modificationTime: '2026-06-01T00:00:00.000Z', blocks: [] });
      const docHtml = `
        <a href="https://www.adobe.com/ecc/system/tools/schedule-maker?schedule=${encodedOld}">old</a>
        <a href="${canonical(encodedNew)}">new</a>
      `;

      const fetchMock = routeFetch([
        ['/list/org/repo/events/e', makeResponse({
          json: [{ path: '/org/repo/events/e/index.html', ext: 'html' }],
        })],
        ['/source/org/repo/events/e/index.html', (url, options) => (options?.method === 'POST'
          ? makeResponse({ ok: true })
          : makeResponse({ text: docHtml })),
        ],
      ]);
      setDaFetch(fetchMock);

      await syncSchedules('org', 'repo', '/events/e');

      const write = fetchMock.calls.find((c) => c.options?.method === 'POST');
      expect(write, 'expected a rewrite POST').to.exist;
      const body = await writtenBody(write.options);
      expect(body).to.include(`href="${canonical(encodedOld)}"`);
      expect(body).to.include(`href="${canonical(encodedNew)}"`);
    });

    it('retries the write after a 412 conflict, re-reading before writing again', async () => {
      const encoded = encodeSchedule({ scheduleId: 's7', title: 'T', modificationTime: '2026-06-01T00:00:00.000Z', blocks: [] });
      const docHtml = `<a href="https://www.adobe.com/ecc/system/tools/schedule-maker?schedule=${encoded}">link</a>`;
      let postAttempts = 0;

      const fetchMock = routeFetch([
        ['/list/org/repo/events/e', makeResponse({
          json: [{ path: '/org/repo/events/e/index.html', ext: 'html' }],
        })],
        ['/source/org/repo/events/e/index.html', (url, options) => {
          if (options?.method === 'POST') {
            postAttempts += 1;
            return postAttempts === 1
              ? makeResponse({ ok: false, status: 412, text: 'conflict' })
              : makeResponse({ ok: true });
          }
          return makeResponse({ text: docHtml, headers: { ETag: '"etag"' } });
        }],
      ]);
      setDaFetch(fetchMock);

      const result = await syncSchedules('org', 'repo', '/events/e');
      expect(result.ok).to.be.true;
      expect(postAttempts).to.equal(2);
    });

    it('leaves the doc untouched if the write never succeeds after retries', async () => {
      const encoded = encodeSchedule({ scheduleId: 's8', title: 'T', modificationTime: '2026-06-01T00:00:00.000Z', blocks: [] });
      const docHtml = `<a href="https://www.adobe.com/ecc/system/tools/schedule-maker?schedule=${encoded}">link</a>`;

      const fetchMock = routeFetch([
        ['/list/org/repo/events/e', makeResponse({
          json: [{ path: '/org/repo/events/e/index.html', ext: 'html' }],
        })],
        ['/source/org/repo/events/e/index.html', (url, options) => (options?.method === 'POST'
          ? makeResponse({ ok: false, status: 500, text: 'server error' })
          : makeResponse({ text: docHtml, headers: { ETag: '"etag"' } })),
        ],
      ]);
      setDaFetch(fetchMock);

      // Sync itself should still succeed (the rewrite is best-effort/background) —
      // it must not abort the whole sync just because a write-back failed.
      const result = await syncSchedules('org', 'repo', '/events/e');
      expect(result.ok).to.be.true;
      expect(result.data.schedules).to.have.lengthOf(1);
      expect(result.data.schedules[0].scheduleId).to.equal('s8');
    });
  });
});
