import { expect } from '@esm-bundle/chai';
import { resolveDrawerTitle } from '../../../../../event-libs/v1/blocks/sessions-guide/components/DrawerHeader.js';

describe('DrawerHeader resolveDrawerTitle', () => {
  const headings = {
    loggedOut: 'See what\'s on at MAX',
    loggedIn: 'Welcome back',
    loggedOutPostEvent: 'Catch up on MAX',
    loggedInPostEvent: 'Watch what you missed',
  };

  it('uses the authored loggedOut heading when logged out, during the event', () => {
    expect(resolveDrawerTitle(headings, { isLoggedIn: false, userFirstName: null, isPost: false }))
      .to.equal('See what\'s on at MAX');
  });

  it('uses the authored loggedIn heading when logged in, during the event', () => {
    expect(resolveDrawerTitle(headings, { isLoggedIn: true, userFirstName: 'Dana', isPost: false }))
      .to.equal('Welcome back');
  });

  it('uses the authored loggedOutPostEvent heading when logged out, post-event', () => {
    expect(resolveDrawerTitle(headings, { isLoggedIn: false, userFirstName: null, isPost: true }))
      .to.equal('Catch up on MAX');
  });

  it('uses the authored loggedInPostEvent heading when logged in, post-event', () => {
    expect(resolveDrawerTitle(headings, { isLoggedIn: true, userFirstName: 'Dana', isPost: true }))
      .to.equal('Watch what you missed');
  });

  it('falls back to the hardcoded default when nothing is authored', () => {
    expect(resolveDrawerTitle({}, { isLoggedIn: false, userFirstName: null, isPost: false }))
      .to.equal("See what's happening at MAX");
    expect(resolveDrawerTitle(undefined, { isLoggedIn: false, userFirstName: null, isPost: false }))
      .to.equal("See what's happening at MAX");
  });

  it('falls back to the first-name greeting when logged in and nothing is authored', () => {
    expect(resolveDrawerTitle({}, { isLoggedIn: true, userFirstName: 'Dana', isPost: false }))
      .to.equal('Dana, see what\'s happening');
  });

  it('falls back to the default when a heading is blank rather than missing', () => {
    expect(resolveDrawerTitle({ loggedOut: '' }, { isLoggedIn: false, userFirstName: null, isPost: false }))
      .to.equal("See what's happening at MAX");
  });

  it('treats isLoggedIn without a userFirstName as logged out', () => {
    expect(resolveDrawerTitle(headings, { isLoggedIn: true, userFirstName: null, isPost: false }))
      .to.equal('See what\'s on at MAX');
  });
});
