import { expect } from '@esm-bundle/chai';

import { getValidCampaignIdFromUrl, resolveRoutedCampaignId, resetCampaignMapCache, getGuestRsvpToken, shouldForceGuestSignIn } from '../../../event-libs/v1/utils/utils.js';

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

describe('getGuestRsvpToken', () => {
  it('returns a well-formed guest RSVP token from the URL', () => {
    expect(getGuestRsvpToken(new URLSearchParams('?guestToken=abc123-DEF456_ghi789'))).to.equal('abc123-DEF456_ghi789');
  });

  it('returns null when the guestToken param is absent', () => {
    expect(getGuestRsvpToken(new URLSearchParams(''))).to.be.null;
  });

  it('returns null when the token is shorter than 16 characters', () => {
    expect(getGuestRsvpToken(new URLSearchParams('?guestToken=too-short'))).to.be.null;
  });

  it('returns null when the token fails pattern validation', () => {
    expect(getGuestRsvpToken(new URLSearchParams('?guestToken=bad/token!with spaces'))).to.be.null;
  });

  it('returns null when the token exceeds 256 chars', () => {
    expect(getGuestRsvpToken(new URLSearchParams(`?guestToken=${'a'.repeat(257)}`))).to.be.null;
  });
});

describe('shouldForceGuestSignIn', () => {
  // Single source of truth shared by decorate.js's handleRSVPBtnBasedOnProfile
  // and events-form.js's onProfile — both call this instead of maintaining
  // their own copy of the gate condition.
  it('forces sign-in for a guest with no allow-guest-registration and no RSVP link token', () => {
    expect(shouldForceGuestSignIn({ account_type: 'guest' }, false)).to.equal(true);
  });

  it('forces sign-in for a noProfile visitor with no token', () => {
    expect(shouldForceGuestSignIn({ noProfile: true }, false)).to.equal(true);
  });

  it('does not force sign-in when allow-guest-registration is enabled', () => {
    expect(shouldForceGuestSignIn({ account_type: 'guest' }, true)).to.equal(false);
  });

  it('does not force sign-in when a valid guest RSVP link token is present', () => {
    expect(shouldForceGuestSignIn({ account_type: 'guest', guestRsvpToken: 'tok-1234567890abcdef' }, false)).to.equal(false);
  });

  it('does not force sign-in when an invalid guest RSVP link token is present', () => {
    expect(shouldForceGuestSignIn({ account_type: 'guest', guestRsvpToken: 'tok-1234567890abcdef', guestLinkInvalid: true }, false)).to.equal(false);
  });

  it('does not force sign-in for a real logged-in (non-guest) profile', () => {
    expect(shouldForceGuestSignIn({ account_type: 'type3' }, false)).to.equal(false);
  });

  it('does not force sign-in when profile is null/undefined', () => {
    expect(shouldForceGuestSignIn(null, false)).to.equal(false);
    expect(shouldForceGuestSignIn(undefined, false)).to.equal(false);
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
