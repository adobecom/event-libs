import { expect } from '@esm-bundle/chai';
import {
  initTierOneEventConfig,
  getTrackIcon,
  getOverrideTrackIcon,
  getAllowDoubleBooking,
  getHomepagePath,
  getBroadcastPath,
  getSessionGuidePath,
} from '../../../event-libs/v1/utils/tier-1-event-config.js';

const CONFIG = {
  trackIcons: {
    'Social Media': { icon: 'social-media', color: '#FF6B35' },
    'video-audio-and-motion': { icon: 'video-audio-and-motion', color: '#000000' },
  },
  overrideTrackIcons: {
    default: { icon: 'business', color: '#111111' },
    byText: {
      'custom label': { icon: 'video', color: '#123456' },
    },
  },
  allowDoubleBooking: true,
  homepagePath: '/summit.html',
};

describe('tier-1-event-config', () => {
  before(() => {
    const meta = document.createElement('meta');
    meta.name = 'tier-1-event-config';
    meta.content = JSON.stringify(CONFIG);
    document.head.appendChild(meta);
    initTierOneEventConfig();
  });

  it('resolves an exact Track-name key', () => {
    expect(getTrackIcon('Social Media')).to.deep.equal({ icon: 'social-media', color: '#FF6B35' });
  });

  it('falls back to a slugified key when the raw name has no exact match', () => {
    expect(getTrackIcon('Video, Audio, and Motion')).to.deep.equal({
      icon: 'video-audio-and-motion',
      color: '#000000',
    });
  });

  it('returns null for a Track with no authored config entry — no built-in default', () => {
    expect(getTrackIcon('Photography')).to.equal(null);
    expect(getTrackIcon('Nonexistent Track')).to.equal(null);
  });

  it('returns null for an empty/undefined track name', () => {
    expect(getTrackIcon('')).to.equal(null);
    expect(getTrackIcon(undefined)).to.equal(null);
  });

  it('resolves an override icon from the per-override-text map', () => {
    expect(getOverrideTrackIcon('custom label')).to.deep.equal({ icon: 'video', color: '#123456' });
  });

  // The event-wide default was dropped 2026-08-24 — every override text is authored
  // explicitly, so an unmapped one resolves to nothing at all.
  it('returns null for an unmapped override text, with no event-wide default', () => {
    expect(getOverrideTrackIcon('some other text')).to.equal(null);
  });

  it('returns null for an empty/undefined override text', () => {
    expect(getOverrideTrackIcon('')).to.equal(null);
    expect(getOverrideTrackIcon(undefined)).to.equal(null);
  });

  it('reads allowDoubleBooking off the same parsed config', () => {
    expect(getAllowDoubleBooking()).to.equal(true);
  });

  it('reads the authored homepage path off the same parsed config', () => {
    expect(getHomepagePath()).to.equal('/summit.html');
  });

  it('returns empty for an event page the config does not declare — the caller decides the fallback', () => {
    expect(getBroadcastPath()).to.equal('');
    expect(getSessionGuidePath()).to.equal('');
  });

  // ?homepagePath=/?broadcastPath=/?sessionGuidePath= let a tester point these getters at a
  // draft URL that doesn't match the authored path yet (e.g. isSamePage() comparisons
  // downstream would otherwise never match on a DA draft path).
  describe('query-param path overrides', () => {
    const basePath = window.location.pathname;

    afterEach(() => {
      history.replaceState(null, '', basePath);
    });

    it('overrides the authored/fallback path when the matching query param is present', () => {
      history.replaceState(null, '', `${basePath}?broadcastPath=/max/2026/drafts/doliva/broadcast`);
      expect(getBroadcastPath()).to.equal('/max/2026/drafts/doliva/broadcast');
    });

    it('overrides even an authored path, not just an empty one', () => {
      history.replaceState(null, '', `${basePath}?homepagePath=/drafts/test-home`);
      expect(getHomepagePath()).to.equal('/drafts/test-home');
    });

    it('rejects an absolute/cross-origin override — same-origin relative paths only', () => {
      history.replaceState(null, '', `${basePath}?broadcastPath=${encodeURIComponent('https://evil.example/phish')}`);
      expect(getBroadcastPath()).to.equal('');
    });

    it('rejects a protocol-relative override (//host/path)', () => {
      history.replaceState(null, '', `${basePath}?broadcastPath=${encodeURIComponent('//evil.example/phish')}`);
      expect(getBroadcastPath()).to.equal('');
    });

    it('falls back to the authored config when no override param is present', () => {
      history.replaceState(null, '', basePath);
      expect(getSessionGuidePath()).to.equal('');
    });
  });

  it('is idempotent — a second init() call does not re-parse or clear the config', () => {
    initTierOneEventConfig();
    expect(getTrackIcon('Social Media')).to.deep.equal({ icon: 'social-media', color: '#FF6B35' });
    expect(getAllowDoubleBooking()).to.equal(true);
  });
});
