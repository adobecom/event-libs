import { expect } from '@esm-bundle/chai';
import { buildNotificationEntry } from '../../../../event-libs/v1/features/swan-notifications/swan-payload.js';
import { initTierOneEventConfig } from '../../../../event-libs/v1/utils/tier-1-event-config.js';

// Own file, not swan-payload.test.js: tier-1-event-config.js's initTierOneEventConfig() is a
// module-level singleton (idempotent after its first call), so this needs the metadata seeded
// and init() called exactly once, in this file's own isolated module instance — mirroring the
// same one-scenario-per-file convention utils/tier-1-event-config-*.test.js already uses.
const CONFIG = {
  trackIcons: {
    'Social Media': { icon: 'social-media', color: '#FF6B35' },
  },
  overrideTrackIcons: {
    byText: {
      'custom label': { icon: 'video', color: '#123456' },
    },
  },
};

describe('swan-payload — buildNotificationEntry trackIconName', () => {
  const swanConfig = { eventName: 'MAX 2026' };

  before(() => {
    const meta = document.createElement('meta');
    meta.name = 'tier-1-event-config';
    meta.content = JSON.stringify(CONFIG);
    document.head.appendChild(meta);
    initTierOneEventConfig();
  });

  it('resolves trackIconName from the session\'s primaryTrack', () => {
    const entry = buildNotificationEntry({ primaryTrack: 'Social Media' }, 'reminder', swanConfig);
    expect(entry.trackIconName).to.equal('social-media');
  });

  it('prefers trackOverride over primaryTrack, same precedence as sessions-guide', () => {
    const entry = buildNotificationEntry(
      { primaryTrack: 'Social Media', trackOverride: 'custom label' },
      'reminder',
      swanConfig,
    );
    expect(entry.trackIconName).to.equal('video');
  });

  it('is null when neither primaryTrack nor trackOverride has a mapped icon', () => {
    const entry = buildNotificationEntry({ primaryTrack: 'Nonexistent Track' }, 'reminder', swanConfig);
    expect(entry.trackIconName).to.equal(null);
  });

  it('is null when the session has no track data at all', () => {
    const entry = buildNotificationEntry({}, 'reminder', swanConfig);
    expect(entry.trackIconName).to.equal(null);
  });
});
