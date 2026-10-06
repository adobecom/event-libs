import { expect } from '@esm-bundle/chai';
import {
  extractTrackIconSlug, extractProductIconSlug, syncIconConfigWithCatalog, buildSessionAuthorEntry,
  buildHomepageConfigURL, decodeHomepageConfigParam, copyHomepageConfigLink,
} from '../../../event-libs/tier-1-event-configurator/utils.js';
import sinon from 'sinon';
import {
  CONFIG_TYPES, HOMEPAGE_FIELD_BY_TYPE,
} from '../../../event-libs/tier-1-event-configurator/constants.js';

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

describe('tier-1-event-configurator/utils syncIconConfigWithCatalog', () => {
  function baseConfig() {
    return {
      trackIcons: {
        branding: { icon: 'branding', color: '#000000' },
        'stale-track': { icon: 'ai-generate', color: '#000000' },
      },
      overrideTrackIcons: {
        byText: {
          'Adobe Live Session': { icon: 'max-accelerating-creativity-ai-track-icon', color: '#000000' },
          'stale override text': { icon: 'ai-generate', color: '#000000' },
        },
      },
      products: {
        'creative-cloud-64': { icon: 'creative-cloud-64', pageUrl: '/products/cc' },
        'stale-product': { icon: 'photoshop-64', pageUrl: '/products/ps' },
      },
    };
  }

  const liveLists = {
    tracks: ['branding'],
    overrideTexts: ['Adobe Live Session'],
    products: ['creative-cloud-64'],
  };

  it('drops trackIcons/overrideTrackIcons/products keys absent from the live catalog', () => {
    const result = syncIconConfigWithCatalog(baseConfig(), liveLists);
    expect(result.hasChanges).to.be.true;
    expect(result.config.trackIcons).to.deep.equal({ branding: { icon: 'branding', color: '#000000' } });
    expect(result.config.overrideTrackIcons.byText).to.deep.equal({
      'Adobe Live Session': { icon: 'max-accelerating-creativity-ai-track-icon', color: '#000000' },
    });
    expect(result.config.products).to.deep.equal({ 'creative-cloud-64': { icon: 'creative-cloud-64', pageUrl: '/products/cc' } });
  });

  it('reports exactly which keys were removed, per section', () => {
    const result = syncIconConfigWithCatalog(baseConfig(), liveLists);
    expect(result.removed.trackIcons).to.deep.equal(['stale-track']);
    expect(result.removed.overrideTrackIcons).to.deep.equal(['stale override text']);
    expect(result.removed.products).to.deep.equal(['stale-product']);
  });

  it('keeps every key that is still in the catalog, untouched', () => {
    const config = baseConfig();
    const result = syncIconConfigWithCatalog(config, liveLists);
    expect(result.config.trackIcons.branding).to.deep.equal(config.trackIcons.branding);
  });

  it('is a no-op — same config reference, hasChanges false — when nothing is stale', () => {
    const config = {
      trackIcons: { branding: { icon: 'branding', color: '#000000' } },
      overrideTrackIcons: { byText: { 'Adobe Live Session': { icon: 'x', color: '#000000' } } },
      products: { 'creative-cloud-64': { icon: 'creative-cloud-64', pageUrl: '' } },
    };
    const result = syncIconConfigWithCatalog(config, liveLists);
    expect(result.hasChanges).to.be.false;
    expect(result.config).to.equal(config);
    expect(result.removed).to.deep.equal({ trackIcons: [], overrideTrackIcons: [], products: [] });
  });

  it('handles an event with no sessions left at all — everything authored gets pruned', () => {
    const result = syncIconConfigWithCatalog(baseConfig(), { tracks: [], overrideTexts: [], products: [] });
    expect(result.config.trackIcons).to.deep.equal({});
    expect(result.config.overrideTrackIcons.byText).to.deep.equal({});
    expect(result.config.products).to.deep.equal({});
    expect(result.removed.trackIcons).to.have.members(['branding', 'stale-track']);
  });

  it('tolerates a config with no trackIcons/overrideTrackIcons/products yet authored', () => {
    const result = syncIconConfigWithCatalog({}, liveLists);
    expect(result.hasChanges).to.be.false;
  });

  it('defaults to empty lists when none are passed', () => {
    const result = syncIconConfigWithCatalog(baseConfig());
    expect(result.config.trackIcons).to.deep.equal({});
    expect(result.config.overrideTrackIcons.byText).to.deep.equal({});
    expect(result.config.products).to.deep.equal({});
  });
});

describe('tier-1-event-configurator/utils buildSessionAuthorEntry', () => {
  function selectValue(label) {
    return { valueId: `${label.toLowerCase()}-id`, label, value: label.toLowerCase(), ordinal: 0 };
  }

  function customAttr(name, values) {
    return { name, values };
  }

  function baseSession(overrides = {}) {
    return {
      sessionId: 'session-1',
      sessionCode: 'OS100',
      externalSessionId: 'rf-123',
      enTitle: 'Test Session',
      url: 'https://example.com/session',
      customAttributes: [
        customAttr('Primary Event Site Track', [selectValue('Branding')]),
      ],
      ...overrides,
    };
  }

  it('includes additionalTracks when the session has any', () => {
    const session = baseSession({
      customAttributes: [
        customAttr('Primary Event Site Track', [selectValue('Branding')]),
        customAttr('Additional Event Site Tracks', [selectValue('Video')]),
      ],
    });
    const entry = buildSessionAuthorEntry(session, [], {});
    expect(entry.additionalTracks).to.deep.equal(['Video']);
  });

  it('omits additionalTracks when the session has none', () => {
    const entry = buildSessionAuthorEntry(baseSession(), [], {});
    expect(entry).to.not.have.property('additionalTracks');
  });

  it('includes the description from the en-US localization when present', () => {
    const session = baseSession({ localizations: { 'en-US': { description: 'A great session' } } });
    const entry = buildSessionAuthorEntry(session, [], {});
    expect(entry.description).to.equal('A great session');
  });

  it('omits description when the session has none', () => {
    const entry = buildSessionAuthorEntry(baseSession(), [], {});
    expect(entry).to.not.have.property('description');
  });

  function videoSession() {
    return baseSession({
      customAttributes: [
        customAttr('Video Duration', [{ value: '00:17:38' }]),
        customAttr('Mobilerider Video ID (Livestream)', [{ value: 'catalog-mr' }]),
      ],
    });
  }

  it('exports catalog duration and MR identity for featured entries without changing the schedule', () => {
    const times = [{ sessionId: 'session-1', startTimeMillis: 1000, endTimeMillis: 2000, timezone: 'UTC' }];
    const result = buildSessionAuthorEntry(
      videoSession(), times, {}, CONFIG_TYPES.HOMEPAGE_FEATURED_SESSIONS,
    );
    expect(result.videoDuration).to.equal('00:17:38');
    expect(result.mrStreamId).to.equal('catalog-mr');
    expect(result.sessionTime).to.deep.equal({ startTimeMillis: 1000, endTimeMillis: 2000, timezone: 'UTC' });
  });

  it('prefers a trimmed author override and falls back to catalog identity for a blank override', () => {
    const featured = CONFIG_TYPES.HOMEPAGE_FEATURED_SESSIONS;
    expect(buildSessionAuthorEntry(videoSession(), [], { mrStreamId: ' override ' }, featured).mrStreamId)
      .to.equal('override');
    expect(buildSessionAuthorEntry(videoSession(), [], { mrStreamId: '   ' }, featured).mrStreamId)
      .to.equal('catalog-mr');
    expect(buildSessionAuthorEntry(baseSession(), [], { mrStreamId: '   ' }, featured))
      .to.not.have.property('mrStreamId');
  });

  it('leaves upcoming and legacy exports unchanged', () => {
    [undefined, CONFIG_TYPES.HOMEPAGE_UPCOMING_SESSIONS].forEach((type) => {
      const result = buildSessionAuthorEntry(videoSession(), [], {}, type);
      expect(result).to.not.have.property('videoDuration');
      expect(result).to.not.have.property('mrStreamId');
      expect(buildSessionAuthorEntry(videoSession(), [], { mrStreamId: 'override' }, type).mrStreamId)
        .to.equal('override');
    });
  });

  it('omits duration and catalog MR ID when the catalog has neither', () => {
    const result = buildSessionAuthorEntry(baseSession(), [], {}, CONFIG_TYPES.HOMEPAGE_FEATURED_SESSIONS);
    expect(result).to.not.have.property('videoDuration');
    expect(result).to.not.have.property('mrStreamId');
  });

  it('preserves featured metadata through URL encoding and decoding', () => {
    const entries = [buildSessionAuthorEntry(videoSession(), [], {}, CONFIG_TYPES.HOMEPAGE_FEATURED_SESSIONS)];
    const url = new URL(buildHomepageConfigURL(
      'adobecom', 'da-events', CONFIG_TYPES.HOMEPAGE_FEATURED_SESSIONS, 'event-1', 'Featured', entries,
    ));
    const decoded = decodeHomepageConfigParam(url.hash.split('=')[1]);
    expect(decoded.entries).to.deep.equal(JSON.parse(JSON.stringify(entries)));
  });

  it('selects featured-only enrichment in the actual copied homepage link', async () => {
    const clipboard = sinon.stub(navigator.clipboard, 'writeText').resolves();
    const richClipboard = typeof window.ClipboardItem === 'function'
      ? sinon.stub(window, 'ClipboardItem').value(undefined) : null;
    try {
      const configType = CONFIG_TYPES.HOMEPAGE_FEATURED_SESSIONS;
      await copyHomepageConfigLink('adobecom', 'da-events', {
        configType,
        eventId: 'event-1',
        config: { homepageFeaturedSessions: ['session-1'] },
      }, HOMEPAGE_FIELD_BY_TYPE[configType], [videoSession()], []);
      const text = clipboard.firstCall.args[0];
      const raw = text.match(/tecHomepage=([^)]*)/)[1];
      expect(decodeHomepageConfigParam(raw).entries[0]).to.include({
        videoDuration: '00:17:38', mrStreamId: 'catalog-mr',
      });
      const upcoming = CONFIG_TYPES.HOMEPAGE_UPCOMING_SESSIONS;
      await copyHomepageConfigLink('adobecom', 'da-events', {
        configType: upcoming,
        eventId: 'event-1',
        config: { upcomingSessions: ['session-1'] },
      }, HOMEPAGE_FIELD_BY_TYPE[upcoming], [videoSession()], []);
      const upcomingRaw = clipboard.secondCall.args[0].match(/tecHomepage=([^)]*)/)[1];
      const upcomingEntry = decodeHomepageConfigParam(upcomingRaw).entries[0];
      expect(upcomingEntry).to.not.have.property('videoDuration');
      expect(upcomingEntry).to.not.have.property('mrStreamId');
    } finally {
      clipboard.restore();
      richClipboard?.restore();
    }
  });
});
