import { expect } from '@esm-bundle/chai';
import init, {
  getScheduleMediaIds, mobileRiderStore,
} from '../../../../../../event-libs/v1/features/timing-framework/plugins/mobile-rider/plugin.js';
import MobileRiderController, {
  MAX_IDS_PER_REQUEST, MAX_UNKNOWN_ID_RETRIES,
} from '../../../../../../event-libs/v1/features/timing-framework/plugins/mobile-rider/mobile-rider-controller.js';

// The store is module-level, so each test uses its own id prefix.
const idsOf = (prefix, count) => Array.from({ length: count }, (_, i) => `${prefix}-${i}`);
const entry = (sessionId) => ({ pathToFragment: `/f/${sessionId}`, mobileRider: { sessionId } });

describe('timing-framework mobile-rider plugin (MWPW-211386)', () => {
  let originalFetch;
  let requests;

  const stubFetch = (respond) => {
    window.fetch = async (url) => {
      const ids = new URL(url).searchParams.get('ids').split(',');
      requests.push({ url: String(url), ids });
      return respond(ids);
    };
  };
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });

  beforeEach(() => {
    originalFetch = window.fetch;
    requests = [];
    sessionStorage.setItem('chrono-box-tab-id', 'plugin-test-tab');
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  describe('getScheduleMediaIds', () => {
    it('collects unique ids from the object and legacy array shapes, skipping entries without one', () => {
      const ids = getScheduleMediaIds([
        entry('a'),
        { mobileRider: [{ sessionId: 'b' }, { sessionId: 'a' }, null, {}] },
        { metadata: [{ key: 'x' }] },
        { mobileRider: {} },
        null,
        entry('c'),
      ]);
      expect(ids.join(',')).to.equal('a,b,c');
    });

    it('returns no ids for an empty or missing schedule', () => {
      expect(getScheduleMediaIds([]).length).to.equal(0);
      expect(getScheduleMediaIds(undefined).length).to.equal(0);
    });
  });

  describe('init', () => {
    it('checks every stream in the schedule with one request instead of one per entry', async () => {
      const ids = idsOf('one', 15);
      stubFetch(() => ok({ active: ids.slice(0, 5), inactive: ids.slice(5) }));

      await init(ids.map(entry));

      expect(requests.length).to.equal(1);
      expect(requests[0].ids.join(',')).to.equal(ids.join(','));
      expect(requests[0].url).to.include('/api/media-status?ids=');
      expect(ids.filter((id) => mobileRiderStore.get(id) === true).length).to.equal(5);
      expect(ids.filter((id) => mobileRiderStore.get(id) === false).length).to.equal(10);
    });

    it('asks once for an id that several entries share', async () => {
      stubFetch(() => ok({ active: ['dup-1'], inactive: [] }));

      await init([entry('dup-1'), entry('dup-1'), { mobileRider: [{ sessionId: 'dup-1' }] }]);

      expect(requests.length).to.equal(1);
      expect(requests[0].ids.join(',')).to.equal('dup-1');
      expect(mobileRiderStore.get('dup-1')).to.equal(true);
    });

    it('makes no request when the schedule has no MobileRider entries', async () => {
      stubFetch(() => ok({ active: [], inactive: [] }));

      const store = await init([{ pathToFragment: '/f/a' }, { metadata: [{ key: 'k' }] }]);

      expect(requests.length).to.equal(0);
      expect(store === mobileRiderStore).to.equal(true);
    });

    it('marks every stream inactive when the request fails, as before', async () => {
      const ids = idsOf('fail', 3);
      window.fetch = async () => { throw new Error('network down'); };

      await init(ids.map(entry));

      expect(ids.every((id) => mobileRiderStore.get(id) === false)).to.equal(true);
    });

    it('marks every stream inactive on a non-OK response, without retrying', async () => {
      const ids = idsOf('5xx', 2);
      stubFetch(() => ({ ok: false, status: 503, json: async () => ({ message: 'busy' }) }));

      await init(ids.map(entry));

      expect(requests.length).to.equal(1);
      expect(ids.every((id) => mobileRiderStore.get(id) === false)).to.equal(true);
    });

    it('treats ids missing from the response, or a response without an active list, as inactive', async () => {
      stubFetch(() => ok({ inactive: [] }));
      await init([entry('noactive-1')]);
      expect(mobileRiderStore.get('noactive-1')).to.equal(false);

      stubFetch(() => ok({ active: ['other'], inactive: [] }));
      await init([entry('missing-1')]);
      expect(mobileRiderStore.get('missing-1')).to.equal(false);
    });
  });

  describe('unknown ids (MobileRider fails the whole request with a 404)', () => {
    // Mirrors the real API: the first unknown id fails the request and is named in the message.
    const stubMobileRider = (known, active) => stubFetch((chunk) => {
      const unknown = chunk.find((id) => !known.includes(id));
      if (unknown) {
        return { ok: false, status: 404, json: async () => ({ success: false, message: `ID ${unknown} not found in JSON data.` }) };
      }
      return ok({ active: chunk.filter((id) => active.includes(id)), inactive: [] });
    });

    let originalLana;
    let warnings;
    beforeEach(() => {
      originalLana = window.lana;
      warnings = [];
      window.lana = {
        log: (message, options) => {
          if (options?.severity === 'warning') warnings.push(message);
        },
      };
    });
    afterEach(() => {
      window.lana = originalLana;
    });

    it('drops one unknown id and still reports the live streams, with one retry', async () => {
      const known = idsOf('u1', 14);
      stubMobileRider(known, known);

      await init([...known.slice(0, 7), 'u1-bad', ...known.slice(7)].map(entry));

      expect(requests.length).to.equal(2);
      expect(requests[1].ids.includes('u1-bad')).to.equal(false);
      expect(known.every((id) => mobileRiderStore.get(id) === true)).to.equal(true);
      expect(mobileRiderStore.get('u1-bad')).to.equal(false);
      expect(warnings.length).to.equal(1);
      expect(warnings[0]).to.include('unknown media id').and.to.include('u1-bad');
    });

    it('falls back to one request per id after MAX_UNKNOWN_ID_RETRIES unknown ids', async () => {
      const known = idsOf('u2', 3);
      const bad = idsOf('u2-bad', MAX_UNKNOWN_ID_RETRIES + 1);
      stubMobileRider(known, [known[0]]);

      await init([...bad, ...known].map(entry));

      const batched = 1 + MAX_UNKNOWN_ID_RETRIES;
      const remaining = known.length + 1;
      expect(requests.length).to.equal(batched + remaining);
      expect(mobileRiderStore.get(known[0])).to.equal(true);
      expect(mobileRiderStore.get(known[1])).to.equal(false);
      expect(bad.every((id) => mobileRiderStore.get(id) === false)).to.equal(true);
      expect(warnings.filter((w) => w.includes('unknown media id')).length)
        .to.equal(MAX_UNKNOWN_ID_RETRIES);
      expect(warnings.filter((w) => w.includes('one by one')).length).to.equal(1);
    });

    it('checks ids one by one when a 404 does not name an id', async () => {
      const ids = idsOf('u3', 3);
      stubFetch((chunk) => (chunk.length > 1
        ? { ok: false, status: 404, json: async () => ({ message: 'Not found' }) }
        : ok({ active: chunk, inactive: [] })));

      await init(ids.map(entry));

      expect(requests.length).to.equal(1 + ids.length);
      expect(ids.every((id) => mobileRiderStore.get(id) === true)).to.equal(true);
      expect(warnings.length).to.equal(1);
      expect(warnings[0]).to.include('one by one');
    });

    it('marks a single unknown id inactive without retrying', async () => {
      stubMobileRider([], []);
      await init([entry('u4-bad')]);
      expect(requests.length).to.equal(1);
      expect(mobileRiderStore.get('u4-bad')).to.equal(false);
      expect(warnings.length).to.equal(1);
      expect(warnings[0]).to.include('unknown media id').and.to.include('u4-bad');
    });
  });

  describe('MobileRiderController.getMediaStatusMap', () => {
    it('splits a very large id list into requests of at most MAX_IDS_PER_REQUEST', async () => {
      const ids = idsOf('big', MAX_IDS_PER_REQUEST + 5);
      stubFetch((chunk) => ok({ active: chunk, inactive: [] }));

      const map = await new MobileRiderController().getMediaStatusMap(ids);

      expect(requests.length).to.equal(2);
      expect(requests[0].ids.length).to.equal(MAX_IDS_PER_REQUEST);
      expect(requests[1].ids.length).to.equal(5);
      expect([...map.values()].every((v) => v === true)).to.equal(true);
    });

    it('keeps a failed chunk inactive without affecting the other chunk', async () => {
      const ids = idsOf('part', MAX_IDS_PER_REQUEST + 2);
      stubFetch((chunk) => {
        if (chunk.length < MAX_IDS_PER_REQUEST) throw new Error('second chunk failed');
        return ok({ active: chunk, inactive: [] });
      });

      const map = await new MobileRiderController().getMediaStatusMap(ids);

      expect(ids.slice(0, MAX_IDS_PER_REQUEST).every((id) => map.get(id) === true)).to.equal(true);
      expect(ids.slice(MAX_IDS_PER_REQUEST).every((id) => map.get(id) === false)).to.equal(true);
    });

    it('returns an empty map without a request for no ids', async () => {
      stubFetch(() => ok({ active: [], inactive: [] }));
      const map = await new MobileRiderController().getMediaStatusMap([]);
      expect(map.size).to.equal(0);
      expect(requests.length).to.equal(0);
    });

    it('keeps isMediaActive working for single ids', async () => {
      stubFetch(() => ok({ active: ['solo'], inactive: [] }));
      expect(await new MobileRiderController().isMediaActive('solo')).to.equal(true);
      expect(requests[0].ids.join(',')).to.equal('solo');
    });
  });
});
