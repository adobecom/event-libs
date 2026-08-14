import { expect } from '@esm-bundle/chai';
import {
  readSheet, writeSheet, mutateSheet, listFolder,
} from '../../../event-libs/v1/utils/da-sheet-controller.js';

describe('utils/da-sheet-controller', () => {
  let originalFetch;
  let lastRequest;

  const stubFetch = (body, { ok = true, status = 200 } = {}) => {
    window.fetch = async (url, options) => {
      lastRequest = { url, options };
      return {
        ok,
        status,
        headers: new Headers({ 'content-type': 'application/json', ...(ok ? { ETag: '"v2"' } : {}) }),
        json: async () => body,
        text: async () => JSON.stringify(body),
      };
    };
  };

  beforeEach(() => {
    originalFetch = window.fetch;
    lastRequest = null;
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  describe('readSheet', () => {
    it('returns rows as-is for a normal single-sheet, multi-row document', async () => {
      stubFetch({ ':type': 'sheet', data: [{ eventId: 'a' }, { eventId: 'b' }] });
      const result = await readSheet('org', 'repo', '/path.json');
      expect(result.ok).to.be.true;
      expect(result.data).to.deep.equal([{ eventId: 'a' }, { eventId: 'b' }]);
      expect(result.otherSheets).to.deep.equal({});
    });

    it('coerces a single-sheet document\'s bare-object data into a one-element array', async () => {
      stubFetch({ ':type': 'sheet', data: { eventId: 'only-one' } });
      const result = await readSheet('org', 'repo', '/path.json');
      expect(result.data).to.deep.equal([{ eventId: 'only-one' }]);
    });

    it('reads rows from the nested "data" sheet in a multi-sheet document', async () => {
      stubFetch({
        ':type': 'multi-sheet',
        ':names': ['data', 'homepage'],
        ':version': 3,
        data: { total: 2, limit: 2, offset: 0, data: [{ eventId: 'a' }, { eventId: 'b' }] },
        homepage: { total: 1, limit: 1, offset: 0, data: [{ configType: 'homepage-upcoming-sessions' }] },
      });
      const result = await readSheet('org', 'repo', '/path.json');
      expect(result.data).to.deep.equal([{ eventId: 'a' }, { eventId: 'b' }]);
    });

    it('coerces a multi-sheet document\'s single-row "data" sheet the same way', async () => {
      stubFetch({
        ':type': 'multi-sheet',
        ':names': ['data', 'homepage'],
        data: { total: 1, limit: 1, offset: 0, data: { eventId: 'only-one' } },
        homepage: { total: 0, limit: 0, offset: 0, data: [] },
      });
      const result = await readSheet('org', 'repo', '/path.json');
      expect(result.data).to.deep.equal([{ eventId: 'only-one' }]);
    });

    it('captures every other named sheet verbatim, for writeSheet to round-trip', async () => {
      const homepageSheet = { total: 1, limit: 1, offset: 0, data: [{ configType: 'homepage-upcoming-sessions' }] };
      stubFetch({
        ':type': 'multi-sheet',
        ':names': ['data', 'homepage'],
        ':version': 3,
        data: { total: 0, limit: 0, offset: 0, data: [] },
        homepage: homepageSheet,
      });
      const result = await readSheet('org', 'repo', '/path.json');
      expect(result.otherSheets).to.deep.equal({ homepage: homepageSheet });
      expect(result.sheetNames).to.deep.equal(['data', 'homepage']);
      expect(result.version).to.equal(3);
    });

    it('returns an empty array when data is missing entirely', async () => {
      stubFetch({ ':type': 'sheet' });
      const result = await readSheet('org', 'repo', '/path.json');
      expect(result.data).to.deep.equal([]);
    });

    it('passes through a non-ok response unchanged', async () => {
      stubFetch({ error: 'not found' }, { ok: false, status: 404 });
      const result = await readSheet('org', 'repo', '/path.json');
      expect(result.ok).to.be.false;
      expect(result.status).to.equal(404);
    });
  });

  describe('writeSheet', () => {
    it('writes a plain single-sheet payload when there are no other sheets to preserve', async () => {
      stubFetch({}, {});
      await writeSheet('org', 'repo', '/path.json', [{ eventId: 'a' }]);
      const blob = lastRequest.options.body.get('data');
      const payload = JSON.parse(await blob.text());
      expect(payload[':type']).to.equal('sheet');
      expect(payload[':sheetname']).to.equal('data');
      expect(payload.data).to.deep.equal([{ eventId: 'a', config: '{}' }]);
    });

    it('preserves other sheets verbatim when writing back a multi-sheet document', async () => {
      stubFetch({}, {});
      const homepageSheet = { total: 1, limit: 1, offset: 0, data: [{ configType: 'homepage-upcoming-sessions' }] };
      await writeSheet('org', 'repo', '/path.json', [{ eventId: 'a' }], {
        otherSheets: { homepage: homepageSheet },
        sheetNames: ['data', 'homepage'],
        version: 3,
      });
      const blob = lastRequest.options.body.get('data');
      const payload = JSON.parse(await blob.text());
      expect(payload[':type']).to.equal('multi-sheet');
      expect(payload[':names']).to.deep.equal(['data', 'homepage']);
      expect(payload[':version']).to.equal(3);
      expect(payload.data.data).to.deep.equal([{ eventId: 'a', config: '{}' }]);
      expect(payload.homepage).to.deep.equal(homepageSheet);
    });
  });

  describe('mutateSheet', () => {
    it('gives mutate() a real array even when the "data" sheet collapsed to a single row', async () => {
      stubFetch({
        ':type': 'multi-sheet',
        ':names': ['data', 'homepage'],
        data: { total: 1, limit: 1, offset: 0, data: { eventId: 'existing' } },
        homepage: { total: 0, limit: 0, offset: 0, data: [] },
      });
      let receivedRows;
      const result = await mutateSheet('org', 'repo', '/path.json', (rows) => {
        receivedRows = rows;
        const idx = rows.findIndex((r) => r.eventId === 'existing');
        const next = [...rows];
        next[idx] = { eventId: 'existing', updated: true };
        return { rows: next, result: next[idx] };
      });
      expect(Array.isArray(receivedRows)).to.be.true;
      expect(result.ok).to.be.true;
      expect(result.data).to.deep.equal({ eventId: 'existing', updated: true });
    });

    it('round-trips a foreign sheet through a full mutate write, unchanged', async () => {
      const homepageSheet = { total: 1, limit: 1, offset: 0, data: [{ configType: 'homepage-upcoming-sessions' }] };
      stubFetch({
        ':type': 'multi-sheet',
        ':names': ['data', 'homepage'],
        ':version': 3,
        data: { total: 1, limit: 1, offset: 0, data: [{ eventId: 'existing' }] },
        homepage: homepageSheet,
      });
      await mutateSheet('org', 'repo', '/path.json', (rows) => ({ rows: [...rows, { eventId: 'new' }], result: null }));
      const blob = lastRequest.options.body.get('data');
      const payload = JSON.parse(await blob.text());
      expect(payload.homepage).to.deep.equal(homepageSheet);
      expect(payload.data.data).to.deep.equal([{ eventId: 'existing', config: '{}' }, { eventId: 'new', config: '{}' }]);
    });
  });

  describe('listFolder path-traversal guard', () => {
    it('rejects a literal .. path segment without making a request', async () => {
      stubFetch([]);
      const result = await listFolder('org', 'repo', '/foo/../bar');
      expect(result.ok).to.be.false;
      expect(result.status).to.equal(400);
      expect(lastRequest).to.be.null;
    });

    it('rejects a percent-encoded .. path segment without making a request', async () => {
      stubFetch([]);
      const result = await listFolder('org', 'repo', '/foo/%2e%2e/bar');
      expect(result.ok).to.be.false;
      expect(result.status).to.equal(400);
      expect(lastRequest).to.be.null;
    });

    it('rejects a malformed percent-encoded segment without making a request', async () => {
      stubFetch([]);
      const result = await listFolder('org', 'repo', '/foo/%/bar');
      expect(result.ok).to.be.false;
      expect(result.status).to.equal(400);
      expect(lastRequest).to.be.null;
    });

    it('allows a normal path through to the request', async () => {
      stubFetch([]);
      const result = await listFolder('org', 'repo', '/foo/bar');
      expect(result.ok).to.be.true;
      expect(lastRequest).to.not.be.null;
    });
  });
});
