import { expect } from '@esm-bundle/chai';

import { getValidCampaignIdFromUrl } from '../../../event-libs/v1/utils/utils.js';

function setMeta(name, content) {
  const meta = document.createElement('meta');
  meta.name = name;
  meta.content = content;
  document.head.appendChild(meta);
}

describe('getValidCampaignIdFromUrl', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  describe('no metadata routing rules', () => {
    it('returns valid campaign ID from URL', () => {
      const params = new URLSearchParams('?campaign=abc123');
      expect(getValidCampaignIdFromUrl(params)).to.equal('abc123');
    });

    it('returns null when campaign param is absent', () => {
      const params = new URLSearchParams('');
      expect(getValidCampaignIdFromUrl(params)).to.be.null;
    });

    it('returns null when campaign param fails pattern validation', () => {
      const params = new URLSearchParams('?campaign=bad/id!');
      expect(getValidCampaignIdFromUrl(params)).to.be.null;
    });

    it('returns null when campaign param exceeds 128 chars', () => {
      const params = new URLSearchParams(`?campaign=${'a'.repeat(129)}`);
      expect(getValidCampaignIdFromUrl(params)).to.be.null;
    });
  });

  describe('with campaign-id routing rules', () => {
    it('replaces campaign ID when old matches', () => {
      setMeta('campaign-id', JSON.stringify([{ old: 'abc', new: 'def' }]));
      const params = new URLSearchParams('?campaign=abc');
      expect(getValidCampaignIdFromUrl(params)).to.equal('def');
    });

    it('returns original ID when no rule matches', () => {
      setMeta('campaign-id', JSON.stringify([{ old: 'xyz', new: 'def' }]));
      const params = new URLSearchParams('?campaign=abc');
      expect(getValidCampaignIdFromUrl(params)).to.equal('abc');
    });

    it('uses the first matching rule in the array', () => {
      setMeta('campaign-id', JSON.stringify([
        { old: 'abc', new: 'first' },
        { old: 'abc', new: 'second' },
      ]));
      const params = new URLSearchParams('?campaign=abc');
      expect(getValidCampaignIdFromUrl(params)).to.equal('first');
    });

    it('applies the correct rule when multiple rules exist', () => {
      setMeta('campaign-id', JSON.stringify([
        { old: 'abc', new: 'def' },
        { old: 'xyz', new: 'uvw' },
      ]));
      const params = new URLSearchParams('?campaign=xyz');
      expect(getValidCampaignIdFromUrl(params)).to.equal('uvw');
    });

    it('returns null when the new ID fails pattern validation', () => {
      setMeta('campaign-id', JSON.stringify([{ old: 'abc', new: 'bad/id!' }]));
      const params = new URLSearchParams('?campaign=abc');
      expect(getValidCampaignIdFromUrl(params)).to.be.null;
    });

    it('returns null when campaign param is absent even with rules present', () => {
      setMeta('campaign-id', JSON.stringify([{ old: 'abc', new: 'def' }]));
      expect(getValidCampaignIdFromUrl(new URLSearchParams(''))).to.be.null;
    });
  });

  describe('malformed metadata', () => {
    it('falls back to original campaign ID when metadata is not valid JSON', () => {
      setMeta('campaign-id', 'not-json');
      const params = new URLSearchParams('?campaign=abc');
      expect(getValidCampaignIdFromUrl(params)).to.equal('abc');
    });

    it('falls back to original campaign ID when metadata is a JSON object (not array)', () => {
      setMeta('campaign-id', JSON.stringify({ old: 'abc', new: 'def' }));
      const params = new URLSearchParams('?campaign=abc');
      expect(getValidCampaignIdFromUrl(params)).to.equal('abc');
    });

    it('falls back to original campaign ID when metadata is an empty array', () => {
      setMeta('campaign-id', '[]');
      const params = new URLSearchParams('?campaign=abc');
      expect(getValidCampaignIdFromUrl(params)).to.equal('abc');
    });
  });
});
