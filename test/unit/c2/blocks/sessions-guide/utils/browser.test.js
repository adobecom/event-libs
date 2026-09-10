import { expect } from '@esm-bundle/chai';
import { isSafariMobile } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/utils/browser.js';

const REAL_IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const REAL_IPOD_SAFARI = 'Mozilla/5.0 (iPod touch; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1';
const IPHONE_FIREFOX = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/126.0 Mobile/15E148 Safari/605.1.15';
const IPHONE_EDGE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/125.0.2535.85 Mobile/15E148 Safari/605.1.15';
const IPHONE_OPERA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) OPiOS/8.5.2.87403 Mobile/15E148 Safari/605.1.15';
const IPHONE_GOOGLE_APP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/314.0.622563956 Mobile/15E148 Safari/604.1';
// Also stands in for iPad Safari: iPadOS 13+ reports this same desktop "Macintosh" UA by
// default (no iPhone/iPod token), indistinguishable here from real desktop Safari — see
// browser.js's comment. A documented limitation, not a bug.
const DESKTOP_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

describe('sessions-guide/utils/browser isSafariMobile', () => {
  it('is true for real Mobile Safari on iPhone', () => {
    expect(isSafariMobile(REAL_IPHONE_SAFARI)).to.be.true;
  });

  it('is true for real Mobile Safari on iPod touch', () => {
    expect(isSafariMobile(REAL_IPOD_SAFARI)).to.be.true;
  });

  it('is false for Chrome on iOS (CriOS) despite sharing the WebKit engine', () => {
    expect(isSafariMobile(IPHONE_CHROME)).to.be.false;
  });

  it('is false for Firefox on iOS (FxiOS)', () => {
    expect(isSafariMobile(IPHONE_FIREFOX)).to.be.false;
  });

  it('is false for Edge on iOS (EdgiOS)', () => {
    expect(isSafariMobile(IPHONE_EDGE)).to.be.false;
  });

  it('is false for Opera on iOS (OPiOS)', () => {
    expect(isSafariMobile(IPHONE_OPERA)).to.be.false;
  });

  it('is false for the Google app\'s in-app browser on iOS (GSA)', () => {
    expect(isSafariMobile(IPHONE_GOOGLE_APP)).to.be.false;
  });

  it('is false for desktop Safari, and iPad Safari which shares its UA (no iPhone/iPod token)', () => {
    expect(isSafariMobile(DESKTOP_SAFARI)).to.be.false;
  });

  it('is false for Chrome on Android', () => {
    expect(isSafariMobile(ANDROID_CHROME)).to.be.false;
  });
});
