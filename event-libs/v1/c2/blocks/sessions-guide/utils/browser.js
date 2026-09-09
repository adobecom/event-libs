// Real Mobile Safari only, via UA sniffing — no CSS feature can distinguish it from other iOS
// browsers, all of which run on the same WebKit engine. Intentionally excludes iPad Safari.
const IOS_MOBILE_UA = /iP(hone|od)/;
const SAFARI_UA = /Safari/;
const OTHER_IOS_BROWSER_UA = /CriOS|FxiOS|EdgiOS|OPiOS|GSA/;

export function isSafariMobile(ua = navigator.userAgent) {
  return IOS_MOBILE_UA.test(ua) && SAFARI_UA.test(ua) && !OTHER_IOS_BROWSER_UA.test(ua);
}
