import { expect } from '@esm-bundle/chai';
import {
  setDaToken,
  setDaFetch,
  getConfigs,
  upsertConfig,
  deleteConfig,
} from '../../../event-libs/tier-1-event-configurator/scripts/da-controller.js';

// A minimal fetch Response stand-in with a case-insensitive headers.get,
// matching the real Headers behavior the controller relies on.
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

// Builds a multi-sheet configs.json body (the shape live files carry once the
// Homepage feature has ever written to them).
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

// A stateful fetch double: GET returns the current sheet; POST captures the
// written body and updates the in-memory sheet so a follow-up GET sees it.
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
      // Re-serialize config back to strings for the next GET.
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

  describe('getConfigs', () => {
    it('backfills a stable configId onto a legacy Global row that has none', async () => {
      setDaFetch(stubSheet([rawRow({ marker: 'A' })])); // no configId
      const result = await getConfigs('org', 'repo');
      expect(result.ok).to.be.true;
      expect(result.data).to.have.lengthOf(1);
      // Deterministic key derived from (configType, eventId).
      expect(result.data[0].configId).to.equal('legacy:global:E1');
    });

    it('leaves an existing configId untouched', async () => {
      setDaFetch(stubSheet([rawRow({ configId: 'keep-me', marker: 'A' })]));
      const result = await getConfigs('org', 'repo');
      expect(result.data[0].configId).to.equal('keep-me');
    });
  });

  describe('upsertConfig — multiple Global configs per event', () => {
    it('editing a legacy (configId-less) Global config does not clobber a newer sibling for the same event', async () => {
      // Sheet as getConfigs would have surfaced it: a newer row (configId) and a
      // legacy row (backfilled to legacy:global:E1). New rows sit first.
      const fetch = stubSheet([
        rawRow({ configId: 'new-1', marker: 'B' }),
        rawRow({ marker: 'A' }), // legacy, no configId
      ]);
      setDaFetch(fetch);

      const result = await upsertConfig('org', 'repo', {
        eventId: 'E1',
        backendEventTitle: 'E1',
        eventServiceEnv: 'prod',
        configType: 'global',
        configId: 'legacy:global:E1', // what getConfigs stamped onto the legacy row
        config: { marker: 'A-edited' },
      });
      expect(result.ok).to.be.true;

      const written = fetch.writes.at(-1).global;
      // Both configs survive — the edit replaced only the legacy row.
      expect(written).to.have.lengthOf(2);
      const sibling = written.find((r) => r.configId === 'new-1');
      const edited = written.find((r) => r.configId === 'legacy:global:E1');
      expect(sibling.config.marker).to.equal('B'); // untouched
      expect(edited.config.marker).to.equal('A-edited'); // updated in place
    });

    it('persists the backfilled configId onto every legacy sibling on write', async () => {
      const fetch = stubSheet([
        rawRow({ configId: 'new-1', marker: 'B' }),
        rawRow({ marker: 'A' }), // legacy — should gain a configId after this save
      ]);
      setDaFetch(fetch);

      await upsertConfig('org', 'repo', {
        eventId: 'E1', backendEventTitle: 'E1', eventServiceEnv: 'prod', configType: 'global', configId: 'new-1', config: { marker: 'B-edited' },
      });

      const written = fetch.writes.at(-1).global;
      expect(written.every((r) => r.configId)).to.be.true;
      expect(written.find((r) => r.config.marker === 'A').configId).to.equal('legacy:global:E1');
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
    it('deletes only the targeted legacy row, leaving its same-event sibling intact', async () => {
      const fetch = stubSheet([
        rawRow({ configId: 'new-1', marker: 'B' }),
        rawRow({ marker: 'A' }), // legacy
      ]);
      setDaFetch(fetch);

      const result = await deleteConfig('org', 'repo', {
        eventId: 'E1', configType: 'global', configId: 'legacy:global:E1',
      });
      expect(result.ok).to.be.true;

      const written = fetch.writes.at(-1).global;
      expect(written).to.have.lengthOf(1);
      expect(written[0].configId).to.equal('new-1');
      expect(written[0].config.marker).to.equal('B');
    });
  });
});
