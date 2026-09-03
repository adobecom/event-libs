import { expect } from '@esm-bundle/chai';
import { isBroadcastEligible } from '../../../event-libs/v1/utils/session-state.js';

describe('isBroadcastEligible', () => {
  it('is eligible for an online-only session', () => {
    expect(isBroadcastEligible({ isOnline: true, isLivestreamed: false })).to.be.true;
  });

  it('is not eligible for a mainstage/keynote session, even if also marked online', () => {
    expect(isBroadcastEligible({ isOnline: true, isLivestreamed: true })).to.be.false;
  });

  it('is not eligible for a mainstage/keynote session with isOnline unset', () => {
    expect(isBroadcastEligible({ isLivestreamed: true })).to.be.false;
  });

  it('is not eligible for a session that is neither online nor livestreamed (e.g. in-person only)', () => {
    expect(isBroadcastEligible({})).to.be.false;
  });
});
