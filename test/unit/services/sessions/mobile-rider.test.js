import { expect } from '@esm-bundle/chai';
import { fetchLiveStatus } from '../../../../event-libs/v1/services/sessions/mobile-rider.js';

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
    expect(lastRequest).to.equal('https://overlay-admin.mobilerider.com/api/media-status?ids=mr-1');
  });

  it('hits the shared dev/stage host for any non-prod env', async () => {
    stubFetch({ active: [], inactive: [] });
    await fetchLiveStatus(['mr-1'], 'dev');
    expect(lastRequest).to.equal('https://overlay-admin-dev.mobilerider.com/api/media-status?ids=mr-1');

    await fetchLiveStatus(['mr-1'], 'stage');
    expect(lastRequest).to.equal('https://overlay-admin-dev.mobilerider.com/api/media-status?ids=mr-1');
  });

  it('joins multiple stream ids with commas', async () => {
    stubFetch({ active: [], inactive: [] });
    await fetchLiveStatus(['mr-1', 'mr-2', 'mr-3'], 'prod');
    expect(lastRequest).to.equal('https://overlay-admin.mobilerider.com/api/media-status?ids=mr-1,mr-2,mr-3');
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
});
