import { expect } from '@esm-bundle/chai';
import {
  initTierOneEventConfig,
  getTrackIcon,
  getAllowDoubleBooking,
} from '../../../event-libs/v1/utils/tier-1-event-config.js';

// video-audio-and-motion's color deliberately differs from its built-in default
// (#E53935, see tier-1-event-config.js) so the override test below proves authored
// config actually takes precedence, rather than merely matching by coincidence.
const CONFIG = {
  trackIcons: {
    'Social Media': { icon: 'social-media', color: '#FF6B35' },
    'video-audio-and-motion': { icon: 'video-audio-and-motion', color: '#000000' },
  },
  allowDoubleBooking: true,
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

  it('returns null for a Track with no config entry and no built-in default', () => {
    expect(getTrackIcon('Nonexistent Track')).to.equal(null);
  });

  it('falls back to the built-in default for a known Track with no authored entry', () => {
    expect(getTrackIcon('Photography')).to.deep.equal({ icon: 'photography', color: '#4CAF50' });
  });

  it('lets authored config override the built-in default for the same Track', () => {
    expect(getTrackIcon('video-audio-and-motion')).to.deep.equal({
      icon: 'video-audio-and-motion',
      color: '#000000',
    });
  });

  it('returns null for an empty/undefined track name', () => {
    expect(getTrackIcon('')).to.equal(null);
    expect(getTrackIcon(undefined)).to.equal(null);
  });

  it('reads allowDoubleBooking off the same parsed config', () => {
    expect(getAllowDoubleBooking()).to.equal(true);
  });

  it('is idempotent — a second init() call does not re-parse or clear the config', () => {
    initTierOneEventConfig();
    expect(getTrackIcon('Social Media')).to.deep.equal({ icon: 'social-media', color: '#FF6B35' });
    expect(getAllowDoubleBooking()).to.equal(true);
  });
});
