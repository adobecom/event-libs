import { expect } from '@esm-bundle/chai';
import {
  initTierOneEventConfig,
  getTrackIcon,
  getOverrideTrackIcon,
  getAllowDoubleBooking,
  getFeaturedSessionIds,
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
  featuredSessions: ['session-b', 'session-a'],
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

  it('resolves an override icon from the per-override-text map first', () => {
    expect(getOverrideTrackIcon('custom label')).to.deep.equal({ icon: 'video', color: '#123456' });
  });

  it('falls back to the event-wide default for an unmapped override text', () => {
    expect(getOverrideTrackIcon('some other text')).to.deep.equal({ icon: 'business', color: '#111111' });
  });

  it('reads allowDoubleBooking off the same parsed config', () => {
    expect(getAllowDoubleBooking()).to.equal(true);
  });

  it('reads featuredSessions off the same parsed config, preserving authored order', () => {
    expect(getFeaturedSessionIds()).to.deep.equal(['session-b', 'session-a']);
  });

  it('is idempotent — a second init() call does not re-parse or clear the config', () => {
    initTierOneEventConfig();
    expect(getTrackIcon('Social Media')).to.deep.equal({ icon: 'social-media', color: '#FF6B35' });
    expect(getAllowDoubleBooking()).to.equal(true);
    expect(getFeaturedSessionIds()).to.deep.equal(['session-b', 'session-a']);
  });
});
