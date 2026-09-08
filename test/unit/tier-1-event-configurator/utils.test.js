import { expect } from '@esm-bundle/chai';
import { extractTrackIconSlug, extractProductIconSlug } from '../../../event-libs/tier-1-event-configurator/utils.js';

describe('tier-1-event-configurator/utils extractTrackIconSlug', () => {
  it('extracts the slug from a full production federal icon URL', () => {
    const url = 'https://www.adobe.com/federal/assets/icons/track-icons/max-accelerating-creativity-ai-track-icon.svg';
    expect(extractTrackIconSlug(url)).to.equal('max-accelerating-creativity-ai-track-icon');
  });

  it('extracts the slug regardless of host — a staging/preview federal URL works too', () => {
    const url = 'https://main--federal--adobecom.aem.page/federal/assets/icons/track-icons/branding.svg';
    expect(extractTrackIconSlug(url)).to.equal('branding');
  });

  it('strips a trailing query string or hash', () => {
    expect(extractTrackIconSlug('https://www.adobe.com/federal/assets/icons/track-icons/branding.svg?v=2'))
      .to.equal('branding');
    expect(extractTrackIconSlug('https://www.adobe.com/federal/assets/icons/track-icons/branding.svg#frag'))
      .to.equal('branding');
  });

  it('is case-insensitive on the .svg extension', () => {
    expect(extractTrackIconSlug('https://www.adobe.com/federal/assets/icons/track-icons/branding.SVG'))
      .to.equal('branding');
  });

  it('passes a plain slug straight through', () => {
    expect(extractTrackIconSlug('branding')).to.equal('branding');
  });

  it('trims surrounding whitespace', () => {
    expect(extractTrackIconSlug('  branding  ')).to.equal('branding');
  });

  // A URL from the wrong federal namespace (product logos, not track icons) doesn't match
  // /track-icons/ — passed through as-is rather than silently extracting the wrong thing,
  // so a mistake stays visibly wrong instead of resolving to an unrelated icon.
  it('leaves a non-track-icons URL untouched', () => {
    const url = 'https://www.adobe.com/federal/assets/svgs/photoshop-64.svg';
    expect(extractTrackIconSlug(url)).to.equal(url);
  });

  it('returns an empty string for empty/null/undefined input', () => {
    expect(extractTrackIconSlug('')).to.equal('');
    expect(extractTrackIconSlug(null)).to.equal('');
    expect(extractTrackIconSlug(undefined)).to.equal('');
  });
});

describe('tier-1-event-configurator/utils extractProductIconSlug', () => {
  it('extracts the slug from a full production federal product-icon URL', () => {
    expect(extractProductIconSlug('https://www.adobe.com/federal/assets/svgs/creative-cloud-64.svg'))
      .to.equal('creative-cloud-64');
  });

  it('extracts the slug regardless of host — a staging/preview federal URL works too', () => {
    expect(extractProductIconSlug('https://main--federal--adobecom.aem.page/federal/assets/svgs/frame-io-64.svg'))
      .to.equal('frame-io-64');
  });

  it('strips a trailing query string or hash', () => {
    expect(extractProductIconSlug('https://www.adobe.com/federal/assets/svgs/photoshop-64.svg?v=2'))
      .to.equal('photoshop-64');
    expect(extractProductIconSlug('https://www.adobe.com/federal/assets/svgs/photoshop-64.svg#frag'))
      .to.equal('photoshop-64');
  });

  it('is case-insensitive on the .svg extension', () => {
    expect(extractProductIconSlug('https://www.adobe.com/federal/assets/svgs/photoshop-64.SVG'))
      .to.equal('photoshop-64');
  });

  it('passes a plain slug straight through', () => {
    expect(extractProductIconSlug('photoshop-64')).to.equal('photoshop-64');
  });

  it('trims surrounding whitespace', () => {
    expect(extractProductIconSlug('  photoshop-64  ')).to.equal('photoshop-64');
  });

  // A URL from either of the other federal namespaces (generic icons or track icons, both
  // of which have a segment between "assets" and "svgs"/the filename) doesn't match — left
  // untouched rather than silently extracting the wrong thing.
  it('leaves a generic-icon-namespace URL untouched', () => {
    const url = 'https://www.adobe.com/federal/assets/icons/svgs/thumbs-up.svg';
    expect(extractProductIconSlug(url)).to.equal(url);
  });

  it('leaves a track-icon-namespace URL untouched', () => {
    const url = 'https://www.adobe.com/federal/assets/icons/track-icons/branding.svg';
    expect(extractProductIconSlug(url)).to.equal(url);
  });

  it('returns an empty string for empty/null/undefined input', () => {
    expect(extractProductIconSlug('')).to.equal('');
    expect(extractProductIconSlug(null)).to.equal('');
    expect(extractProductIconSlug(undefined)).to.equal('');
  });
});
