import { expect } from '@esm-bundle/chai';
import {
  fetchLiveStatus, MAX_UNKNOWN_ID_RETRIES, UNKNOWN_ID_RECHECK_MS,
} from '../../../../event-libs/v1/services/sessions/mobile-rider.js';

describe('services/sessions/mobile-rider', () => {
  let originalFetch;
  let lastRequest;

  const stubFetch = (body, { ok = true, status = 200 } = {}) => {
    window.fetch = async (url) => {
      lastRequest = url;
      return { ok, status, json: async () => body };
    };
  };

  beforeEach(() => {
    originalFetch = window.fetch;
    lastRequest = null;
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  it('returns empty Sets without fetching when there are no stream ids', async () => {
    const result = await fetchLiveStatus([], 'prod');
    expect(result.active).to.be.instanceOf(Set).and.have.lengthOf(0);
    expect(result.inactive).to.be.instanceOf(Set).and.have.lengthOf(0);
    expect(lastRequest).to.be.null;
  });

  it('hits the production host for env "prod"', async () => {
    stubFetch({ active: [], inactive: [] });
    await fetchLiveStatus(['mr-1'], 'prod');
    expect(lastRequest).to.equal('https://overlay-admin-prod.mobilerider.com/api/media-status?ids=mr-1');
  });

  it('hits the shared dev/QA/stage integration host for any non-prod env', async () => {
    stubFetch({ active: [], inactive: [] });
    await fetchLiveStatus(['mr-1'], 'dev');
    expect(lastRequest).to.equal('https://overlay-admin-integration.mobilerider.com/api/media-status?ids=mr-1');

    await fetchLiveStatus(['mr-1'], 'stage');
    expect(lastRequest).to.equal('https://overlay-admin-integration.mobilerider.com/api/media-status?ids=mr-1');
  });

  it('joins multiple stream ids with commas', async () => {
    stubFetch({ active: [], inactive: [] });
    await fetchLiveStatus(['mr-1', 'mr-2', 'mr-3'], 'prod');
    expect(lastRequest).to.equal('https://overlay-admin-prod.mobilerider.com/api/media-status?ids=mr-1,mr-2,mr-3');
  });

  it('converts the response active/inactive arrays into Sets', async () => {
    stubFetch({ active: ['mr-1'], inactive: ['mr-2', 'mr-3'] });
    const result = await fetchLiveStatus(['mr-1', 'mr-2', 'mr-3'], 'prod');
    expect(result.active).to.be.instanceOf(Set);
    expect(result.inactive).to.be.instanceOf(Set);
    expect([...result.active]).to.deep.equal(['mr-1']);
    expect([...result.inactive]).to.deep.equal(['mr-2', 'mr-3']);
  });

  it('defaults active/inactive to empty arrays when the response omits them', async () => {
    stubFetch({});
    const result = await fetchLiveStatus(['mr-1'], 'prod');
    expect(result.active.size).to.equal(0);
    expect(result.inactive.size).to.equal(0);
  });

  it('throws on a non-ok response', async () => {
    stubFetch({}, { ok: false, status: 503 });
    let caught;
    try {
      await fetchLiveStatus(['mr-1'], 'prod');
    } catch (err) {
      caught = err;
    }
    expect(caught).to.be.instanceOf(Error);
    expect(caught.message).to.include('503');
  });

  describe('unknown ids (Mobile Rider fails the whole request with a 404)', () => {
    let requests;
    let warnings;
    let originalLana;

    // Mirrors the real API: the first unknown id fails the request and is named in the message.
    const stubMobileRider = (known, active) => {
      window.fetch = async (url) => {
        const ids = new URL(url).searchParams.get('ids').split(',');
        requests.push(ids);
        const unknown = ids.find((id) => !known.includes(id));
        if (unknown) {
          return { ok: false, status: 404, json: async () => ({ success: false, message: `ID ${unknown} not found in JSON data.` }) };
        }
        return { ok: true, status: 200, json: async () => ({ active: ids.filter((id) => active.includes(id)), inactive: ids.filter((id) => !active.includes(id)) }) };
      };
    };

    beforeEach(() => {
      requests = [];
      warnings = [];
      originalLana = window.lana;
      window.lana = { log: (message, options) => { if (options?.severity === 'warning') warnings.push(message); } };
    });

    afterEach(() => {
      window.lana = originalLana;
    });

    it('drops the unknown id, reports it inactive and still returns the live streams', async () => {
      stubMobileRider(['a1', 'a2', 'a3'], ['a1', 'a3']);
      const result = await fetchLiveStatus(['a1', 'a-bad', 'a2', 'a3'], 'prod');

      expect(requests.length).to.equal(2);
      expect(requests[1]).to.deep.equal(['a1', 'a2', 'a3']);
      expect([...result.active]).to.deep.equal(['a1', 'a3']);
      expect([...result.inactive].sort()).to.deep.equal(['a-bad', 'a2']);
      expect(warnings.length).to.equal(1);
      expect(warnings[0]).to.include('unknown media id').and.to.include('a-bad');
    });

    it('does not ask for a known-unknown id again on the next poll', async () => {
      stubMobileRider(['b1'], ['b1']);
      await fetchLiveStatus(['b1', 'b-bad'], 'prod');
      requests.length = 0;

      const result = await fetchLiveStatus(['b1', 'b-bad'], 'prod');

      expect(requests).to.deep.equal([['b1']]);
      expect([...result.active]).to.deep.equal(['b1']);
      expect([...result.inactive]).to.deep.equal(['b-bad']);
    });

    it('keeps the cache per env', async () => {
      stubMobileRider(['c1'], ['c1']);
      await fetchLiveStatus(['c1', 'c-bad'], 'prod');
      requests.length = 0;

      await fetchLiveStatus(['c1', 'c-bad'], 'dev');

      expect(requests[0]).to.deep.equal(['c1', 'c-bad']);
    });

    it('handles several unknown ids and an all-unknown list', async () => {
      stubMobileRider(['d1'], ['d1']);
      const mixed = await fetchLiveStatus(['d-bad1', 'd1', 'd-bad2'], 'prod');
      expect([...mixed.active]).to.deep.equal(['d1']);
      expect([...mixed.inactive].sort()).to.deep.equal(['d-bad1', 'd-bad2']);

      requests.length = 0;
      const none = await fetchLiveStatus(['d-bad3'], 'prod');
      expect(none.active.size).to.equal(0);
      expect([...none.inactive]).to.deep.equal(['d-bad3']);
      expect(requests.length).to.equal(1);
    });

    it('gives up and throws after MAX_UNKNOWN_ID_RETRIES unknown ids', async () => {
      const bad = Array.from({ length: MAX_UNKNOWN_ID_RETRIES + 2 }, (_, i) => `e-bad${i}`);
      stubMobileRider([], []);
      let caught;
      try {
        await fetchLiveStatus(bad, 'prod');
      } catch (err) {
        caught = err;
      }
      expect(caught).to.be.instanceOf(Error);
      expect(caught.message).to.include('404');
      expect(requests.length).to.equal(MAX_UNKNOWN_ID_RETRIES + 1);
    });

    it('throws on a 404 that does not name an id', async () => {
      window.fetch = async () => ({ ok: false, status: 404, json: async () => ({ message: 'Not found' }) });
      let caught;
      try {
        await fetchLiveStatus(['f1', 'f2'], 'prod');
      } catch (err) {
        caught = err;
      }
      expect(caught.message).to.include('404');
    });

    it('throws a plain error on a 404 with a null body', async () => {
      window.fetch = async () => ({ ok: false, status: 404, json: async () => null });
      let caught;
      try {
        await fetchLiveStatus(['h1', 'h2'], 'prod');
      } catch (err) {
        caught = err;
      }
      expect(caught.message).to.include('404');
    });

    it('makes no request when every id is a known-unknown id', async () => {
      stubMobileRider([], []);
      await fetchLiveStatus(['i-bad'], 'prod');
      requests.length = 0;

      const result = await fetchLiveStatus(['i-bad'], 'prod');

      expect(requests.length).to.equal(0);
      expect(result.active.size).to.equal(0);
      expect([...result.inactive]).to.deep.equal(['i-bad']);
    });

    it('asks again after UNKNOWN_ID_RECHECK_MS and picks the id up once Mobile Rider knows it', async () => {
      stubMobileRider(['j1'], ['j1']);
      await fetchLiveStatus(['j1', 'j-late'], 'prod');

      const realNow = Date.now;
      Date.now = () => realNow() + UNKNOWN_ID_RECHECK_MS + 1;
      try {
        requests.length = 0;
        stubMobileRider(['j1', 'j-late'], ['j1', 'j-late']);
        const result = await fetchLiveStatus(['j1', 'j-late'], 'prod');

        expect(requests).to.deep.equal([['j1', 'j-late']]);
        expect([...result.active].sort()).to.deep.equal(['j-late', 'j1']);
        expect(result.inactive.size).to.equal(0);
      } finally {
        Date.now = realNow;
      }

      requests.length = 0;
      await fetchLiveStatus(['j1', 'j-late'], 'prod');
      expect(requests).to.deep.equal([['j1', 'j-late']]);
    });

    it('does not retry other failures', async () => {
      window.fetch = async () => {
        requests.push([]);
        return { ok: false, status: 500, json: async () => ({ message: 'ID g1 not found in JSON data.' }) };
      };
      let caught;
      try {
        await fetchLiveStatus(['g1', 'g2'], 'prod');
      } catch (err) {
        caught = err;
      }
      expect(caught.message).to.include('500');
      expect(requests.length).to.equal(1);
    });
  });
});
