import { expect } from '@esm-bundle/chai';
import { buildStageCampaignRule } from '../../../../event-libs/v1/features/swan-notifications/swan-payload.js';
import { initTierOneEventConfig } from '../../../../event-libs/v1/utils/tier-1-event-config.js';
import { setFederalRootOverride } from '../../../../event-libs/v1/features/icons/federal-icons.js';

// Own file, not swan-payload.test.js: tier-1-event-config.js's initTierOneEventConfig() is a
// module-level singleton (idempotent after its first call), so this needs the metadata seeded
// and init() called exactly once, in this file's own isolated module instance — mirroring the
// same one-scenario-per-file convention swan-payload-track-icon.test.js already uses.
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

describe('swan-payload — buildStageCampaignRule timeline.serviceIconDetails.serviceIcon (unc)', () => {
  const swanConfig = {
    eventName: 'MAX 2026',
    defaultNotificationIconUrl: 'https://example.com/icon.png',
    localNotificationPersistTillDays: 3,
  };
  const session = {
    id: 'RF-1',
    rfCode: 'RF-1',
    title: 'My Session',
    sessionPageUrl: '/sessions/my-session',
    startTimeUtc: '2026-10-28T16:00:00.000Z',
    endTimeUtc: '2026-10-28T17:00:00.000Z',
  };

  before(() => {
    setFederalRootOverride('https://federal.example.com');
    const meta = document.createElement('meta');
    meta.name = 'tier-1-event-config';
    meta.content = JSON.stringify(CONFIG);
    document.head.appendChild(meta);
    initTierOneEventConfig();
  });

  function serviceIconFor(sessionOverrides, config = swanConfig) {
    const { campaignRule } = buildStageCampaignRule({ ...session, ...sessionOverrides }, 'reminder', config);
    return campaignRule.events[0].notification_channels[0].channel_details.payload.timeline.serviceIconDetails.serviceIcon;
  }

  it('resolves the track icon URL from primaryTrack when there is no thumbnail', () => {
    expect(serviceIconFor({ primaryTrack: 'Social Media' }))
      .to.equal('https://federal.example.com/federal/assets/icons/track-icons/social-media.svg');
  });

  it('prefers trackOverride over primaryTrack, same precedence as buildNotificationEntry', () => {
    expect(serviceIconFor({ primaryTrack: 'Social Media', trackOverride: 'custom label' }))
      .to.equal('https://federal.example.com/federal/assets/icons/track-icons/video.svg');
  });

  it('prefers thumbnailUrl over any resolvable track icon', () => {
    expect(serviceIconFor({ primaryTrack: 'Social Media', thumbnailUrl: 'https://example.com/session-thumb.png' }))
      .to.equal('https://example.com/session-thumb.png');
  });

  it('falls back to swanConfig.defaultNotificationIconUrl when there is no thumbnail and no mapped track icon', () => {
    expect(serviceIconFor({ primaryTrack: 'Nonexistent Track' })).to.equal(swanConfig.defaultNotificationIconUrl);
  });

  it('falls back to an empty string when nothing resolves', () => {
    expect(serviceIconFor({}, { ...swanConfig, defaultNotificationIconUrl: '' })).to.equal('');
  });
});
