import { expect } from '@esm-bundle/chai';

import { getValidCampaignIdFromUrl, resolveRoutedCampaignId, resetCampaignMapCache } from '../../../event-libs/v1/utils/utils.js';

function mockCampaignMap(rules) {
  window.fetch = async (url) => {
    if (url.includes('campaign-map.json')) {
      return { ok: true, json: async () => ({ data: rules }) };
    }
    return { ok: false, status: 404 };
  };
}

describe('getValidCampaignIdFromUrl', () => {
  it('returns valid campaign ID from URL', () => {
    expect(getValidCampaignIdFromUrl(new URLSearchParams('?campaign=abc123'))).to.equal('abc123');
  });

  it('returns null when campaign param is absent', () => {
    expect(getValidCampaignIdFromUrl(new URLSearchParams(''))).to.be.null;
  });

  it('returns null when campaign param fails pattern validation', () => {
    expect(getValidCampaignIdFromUrl(new URLSearchParams('?campaign=bad/id!'))).to.be.null;
  });

  it('returns null when campaign param exceeds 128 chars', () => {
    expect(getValidCampaignIdFromUrl(new URLSearchParams(`?campaign=${'a'.repeat(129)}`))).to.be.null;
  });
});

describe('resolveRoutedCampaignId', () => {
  let originalFetch;
  before(() => { originalFetch = window.fetch; });
  afterEach(() => {
    window.fetch = originalFetch;
    resetCampaignMapCache();
  });

  describe('no routing rules (fetch fails)', () => {
    beforeEach(() => { window.fetch = async () => ({ ok: false, status: 500 }); });

    it('returns campaign ID from URL unchanged', async () => {
      expect(await resolveRoutedCampaignId(new URLSearchParams('?campaign=abc123'))).to.equal('abc123');
    });

    it('returns null when campaign param is absent', async () => {
      expect(await resolveRoutedCampaignId(new URLSearchParams(''))).to.be.null;
    });
  });

  describe('with campaign-map.json routing rules', () => {
    beforeEach(() => mockCampaignMap([
      { old: 'abc', new: 'def' },
      { old: 'xyz', new: 'uvw' },
    ]));

    it('replaces campaign ID when old matches', async () => {
      expect(await resolveRoutedCampaignId(new URLSearchParams('?campaign=abc'))).to.equal('def');
    });

    it('applies the correct rule when multiple rules exist', async () => {
      expect(await resolveRoutedCampaignId(new URLSearchParams('?campaign=xyz'))).to.equal('uvw');
    });

    it('returns original ID when no rule matches', async () => {
      expect(await resolveRoutedCampaignId(new URLSearchParams('?campaign=other'))).to.equal('other');
    });

    it('returns null when campaign param is absent', async () => {
      expect(await resolveRoutedCampaignId(new URLSearchParams(''))).to.be.null;
    });
  });

  describe('invalid new ID in rules', () => {
    beforeEach(() => mockCampaignMap([{ old: 'abc', new: 'bad/id!' }]));

    it('falls back to original ID when new ID fails pattern validation', async () => {
      expect(await resolveRoutedCampaignId(new URLSearchParams('?campaign=abc'))).to.equal('abc');
    });
  });
});
