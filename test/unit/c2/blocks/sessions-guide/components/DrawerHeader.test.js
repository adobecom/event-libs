import { expect } from '@esm-bundle/chai';
import { resolveDrawerTitle, interpolateHeading } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/DrawerHeader.js';

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

  it('interpolates the {firstName} placeholder in an authored logged-in heading', () => {
    expect(resolveDrawerTitle(
      { loggedIn: '{firstName}, see what\'s happening' },
      { isLoggedIn: true, userFirstName: 'Dana', isPost: false },
    )).to.equal('Dana, see what\'s happening');
    expect(resolveDrawerTitle(
      { loggedInPostEvent: 'Welcome back, {firstName}!' },
      { isLoggedIn: true, userFirstName: 'Dana', isPost: true },
    )).to.equal('Welcome back, Dana!');
  });
});

describe('DrawerHeader interpolateHeading', () => {
  it('replaces every occurrence of the canonical single-brace token', () => {
    expect(interpolateHeading('{firstName}, hi {firstName}', 'Dana')).to.equal('Dana, hi Dana');
  });

  it('accepts double braces, alternate spellings, and inner whitespace', () => {
    ['{{firstName}}', '{first_name}', '{first-name}', '{ first name }', '{userName}', '{name}']
      .forEach((token) => {
        expect(interpolateHeading(`${token}, welcome`, 'Dana')).to.equal('Dana, welcome');
      });
  });

  it('is case-insensitive on the token name', () => {
    expect(interpolateHeading('{FIRSTNAME}, welcome', 'Dana')).to.equal('Dana, welcome');
  });

  it('leaves headings without a token untouched', () => {
    expect(interpolateHeading('See what\'s on at MAX', 'Dana')).to.equal('See what\'s on at MAX');
  });

  it('drops the token and a trailing comma when there is no name', () => {
    expect(interpolateHeading('{firstName}, see what\'s happening', null))
      .to.equal('See what\'s happening');
    expect(interpolateHeading('{firstName} see what\'s happening', ''))
      .to.equal('See what\'s happening');
  });

  it('passes blank and missing headings straight through', () => {
    expect(interpolateHeading('', 'Dana')).to.equal('');
    expect(interpolateHeading(undefined, 'Dana')).to.equal(undefined);
  });
});
