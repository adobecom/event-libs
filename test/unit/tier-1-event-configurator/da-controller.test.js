import { expect } from '@esm-bundle/chai';
import {
  setDaToken,
  setDaFetch,
  getConfigs,
  upsertConfig,
  deleteConfig,
} from '../../../event-libs/tier-1-event-configurator/scripts/da-controller.js';

// Minimal fetch Response stand-in with a case-insensitive headers.get.
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

const SHEET_URL = '/source/org/repo/tools/da-apps/tier-1-event-configurator/configs.json';

// Multi-sheet configs.json body (the shape live files carry once Homepage exists).
function multiSheetBody(globalRows, homepageRows = []) {
  const sheet = (rows) => ({
    total: rows.length, limit: rows.length, offset: 0, data: rows,
  });
  return {
    ':type': 'multi-sheet',
    ':names': ['data', 'homepage'],
    ':version': 3,
    data: sheet(globalRows),
    homepage: sheet(homepageRows),
  };
}

// A raw sheet row as stored in DA — config is a JSON string, not an object.
function rawRow({ configId, marker, configType = 'global' }) {
  const row = { eventId: 'E1', configType, config: JSON.stringify({ marker, eventId: 'E1' }) };
  if (configId) row.configId = configId;
  return row;
}

// Stateful fetch double: GET returns the current sheet; POST captures and applies the write.
function stubSheet(initialGlobalRows, initialHomepageRows = []) {
  const state = { global: initialGlobalRows, homepage: initialHomepageRows };
  const writes = [];
  const fn = async (url, options) => {
    if (!url.includes(SHEET_URL)) {
      return makeResponse({ ok: false, status: 404, statusText: 'not found' });
    }
    if (options?.method === 'POST') {
      const body = JSON.parse(await options.body.get('data').text());
      const parseSheet = (s) => (s?.data || []).map((r) => ({
        ...r, config: typeof r.config === 'string' ? JSON.parse(r.config) : r.config,
      }));
      writes.push({ global: parseSheet(body.data), homepage: parseSheet(body.homepage) });
      state.global = (body.data?.data || []);
      state.homepage = (body.homepage?.data || []);
      return makeResponse({ ok: true, headers: { ETag: '"w"' } });
    }
    return makeResponse({ json: multiSheetBody(state.global, state.homepage), headers: { ETag: '"r"' } });
  };
  fn.writes = writes;
  return fn;
}

describe('tier-1-event-configurator da-controller', () => {
  beforeEach(() => setDaToken('test-token'));
  afterEach(() => {
    setDaFetch(null);
    setDaToken(null);
  });

  describe('getConfigs — unique configId repair', () => {
    it('assigns a configId to a row that has none', async () => {
      setDaFetch(stubSheet([rawRow({ marker: 'A' })]));
      const result = await getConfigs('org', 'repo');
      expect(result.ok).to.be.true;
      expect(result.data).to.have.lengthOf(1);
      expect(result.data[0].configId).to.be.a('string').and.not.equal('');
    });

    it('gives two configId-less rows for the same event DISTINCT ids', async () => {
      setDaFetch(stubSheet([rawRow({ marker: 'A' }), rawRow({ marker: 'B' })]));
      const result = await getConfigs('org', 'repo');
      expect(result.data).to.have.lengthOf(2);
      const ids = result.data.map((r) => r.configId);
      expect(new Set(ids).size).to.equal(2);
    });

    it('repairs rows that already share a legacy:* id (from the earlier broken build) into distinct real ids', async () => {
      const fetch = stubSheet([
        rawRow({ configId: 'legacy:global:E1', marker: 'A' }),
        rawRow({ configId: 'legacy:global:E1', marker: 'B' }),
      ]);
      setDaFetch(fetch);
      const result = await getConfigs('org', 'repo');
      const ids = result.data.map((r) => r.configId);
      expect(new Set(ids).size).to.equal(2);
      expect(ids.every((id) => !id.startsWith('legacy:'))).to.be.true;
      // Repair is persisted, not just in memory.
      expect(fetch.writes.length).to.be.greaterThan(0);
    });

    it('leaves an existing unique configId untouched (and does not rewrite the sheet)', async () => {
      const fetch = stubSheet([rawRow({ configId: 'keep-me', marker: 'A' })]);
      setDaFetch(fetch);
      const result = await getConfigs('org', 'repo');
      expect(result.data[0].configId).to.equal('keep-me');
      expect(fetch.writes.length).to.equal(0);
    });

    it('does not double-count a legacy single-sheet file', async () => {
      const singleSheet = {
        ':type': 'sheet',
        ':sheetname': 'data',
        total: 1,
        limit: 1,
        offset: 0,
        data: [{ eventId: 'E1', configType: 'global', config: JSON.stringify({ marker: 'A' }) }],
      };
      const state = { body: singleSheet };
      setDaFetch(async (url, options) => {
        if (!url.includes(SHEET_URL)) return makeResponse({ ok: false, status: 404 });
        if (options?.method === 'POST') { return makeResponse({ ok: true, headers: { ETag: '"w"' } }); }
        return makeResponse({ json: state.body, headers: { ETag: '"r"' } });
      });
      const result = await getConfigs('org', 'repo');
      expect(result.data).to.have.lengthOf(1);
      expect(result.data[0].configId).to.be.a('string').and.not.equal('');
    });
  });

  describe('upsertConfig — multiple Global configs per event', () => {
    it('editing one config does not clobber a sibling for the same event', async () => {
      const fetch = stubSheet([
        rawRow({ configId: 'id-b', marker: 'B' }),
        rawRow({ configId: 'id-a', marker: 'A' }),
      ]);
      setDaFetch(fetch);

      const result = await upsertConfig('org', 'repo', {
        eventId: 'E1', backendEventTitle: 'E1', eventServiceEnv: 'prod', configType: 'global', configId: 'id-a', config: { marker: 'A-edited' },
      });
      expect(result.ok).to.be.true;

      const written = fetch.writes.at(-1).global;
      expect(written).to.have.lengthOf(2);
      expect(written.find((r) => r.configId === 'id-b').config.marker).to.equal('B');
      expect(written.find((r) => r.configId === 'id-a').config.marker).to.equal('A-edited');
    });

    it('appends a new config rather than overwriting an existing one for the same event', async () => {
      const fetch = stubSheet([rawRow({ configId: 'existing', marker: 'A' })]);
      setDaFetch(fetch);

      await upsertConfig('org', 'repo', {
        eventId: 'E1', backendEventTitle: 'E1', eventServiceEnv: 'prod', configType: 'global', configId: 'brand-new', config: { marker: 'C' },
      });

      const written = fetch.writes.at(-1).global;
      expect(written).to.have.lengthOf(2);
      expect(written.map((r) => r.configId)).to.include.members(['existing', 'brand-new']);
    });
  });

  describe('deleteConfig', () => {
    it('removes only the targeted row when the event has multiple configs', async () => {
      const fetch = stubSheet([
        rawRow({ configId: 'id-b', marker: 'B' }),
        rawRow({ configId: 'id-a', marker: 'A' }),
      ]);
      setDaFetch(fetch);

      const result = await deleteConfig('org', 'repo', { eventId: 'E1', configType: 'global', configId: 'id-a' });
      expect(result.ok).to.be.true;

      const written = fetch.writes.at(-1).global;
      expect(written).to.have.lengthOf(1);
      expect(written[0].configId).to.equal('id-b');
    });

    it('end to end: after id repair, deleting one of two same-event configs leaves the other (the reported bug)', async () => {
      const fetch = stubSheet([
        rawRow({ configId: 'legacy:global:E1', marker: 'A' }),
        rawRow({ configId: 'legacy:global:E1', marker: 'B' }),
      ]);
      setDaFetch(fetch);

      const loaded = await getConfigs('org', 'repo');
      const rowA = loaded.data.find((r) => r.config.marker === 'A');
      await deleteConfig('org', 'repo', {
        eventId: rowA.eventId, configType: rowA.configType, configId: rowA.configId,
      });

      const remaining = fetch.writes.at(-1).global;
      expect(remaining).to.have.lengthOf(1);
      expect(remaining[0].config.marker).to.equal('B');
    });
  });
});
