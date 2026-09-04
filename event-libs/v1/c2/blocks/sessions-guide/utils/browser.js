// Real Mobile Safari only — every other iOS browser (Chrome, Firefox, Edge, Opera, the
// Google app's in-app browser, ...) is required by Apple to run on the same WebKit engine
// underneath, so no CSS feature-detection (@supports, -webkit-* probes, etc.) can tell them
// apart from actual Safari; a UA check is the only way. This mirrors the standard
// "Safari present, no other browser's own UA token present" test.
// iPadOS 13+ reports a desktop "Macintosh" UA by default (no iPhone/iPod token) unless the
// visitor has explicitly requested the mobile site, so this intentionally does not catch
// iPad Safari — the caller only needs to dodge Safari's phone-sized floating tab bar.
const IOS_MOBILE_UA = /iP(hone|od)/;
const SAFARI_UA = /Safari/;
const OTHER_IOS_BROWSER_UA = /CriOS|FxiOS|EdgiOS|OPiOS|GSA/;

export function isSafariMobile(ua = navigator.userAgent) {
  return IOS_MOBILE_UA.test(ua) && SAFARI_UA.test(ua) && !OTHER_IOS_BROWSER_UA.test(ua);
}
