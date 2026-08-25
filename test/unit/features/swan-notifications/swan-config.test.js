import { expect } from '@esm-bundle/chai';
import { isSwanEnabled, getSwanConfig } from '../../../../event-libs/v1/features/swan-notifications/swan-config.js';

function setMeta(name, content) {
  document.head.querySelector(`meta[name="${name}"]`)?.remove();
  if (content === undefined) return;
  const meta = document.createElement('meta');
  meta.name = name;
  meta.content = content;
  document.head.appendChild(meta);
}

describe('swan-config', () => {
  afterEach(() => {
    setMeta('swan-notifications');
    setMeta('tier-1-event-config');
  });

  describe('isSwanEnabled', () => {
    it('is disabled when the swan-notifications metadata flag is absent', () => {
      expect(isSwanEnabled()).to.equal(false);
    });

    it('is disabled for any value other than the literal string "true"', () => {
      setMeta('swan-notifications', 'yes');
      expect(isSwanEnabled()).to.equal(false);
    });

    it('is enabled once the flag is authored as "true"', () => {
      setMeta('swan-notifications', 'true');
      expect(isSwanEnabled()).to.equal(true);
    });
  });

  describe('getSwanConfig', () => {
    it('returns hardcoded defaults with a generic event name when no tier-1-event-config is present', () => {
      const config = getSwanConfig();
      expect(config.eventName).to.equal('Event');
      expect(config.upcomingOffsetMinutes).to.equal(5);
      expect(config.defaultNotificationIconUrl).to.equal('');
      expect(config.defaultNotificationImageUrl).to.equal('');
    });

    it('derives eventName from tier-1-event-config metadata when present', () => {
      setMeta('tier-1-event-config', JSON.stringify({ backendEventTitle: 'MAX 2026' }));
      expect(getSwanConfig().eventName).to.equal('MAX 2026');
    });

    it('falls back to defaults when tier-1-event-config metadata is malformed JSON', () => {
      setMeta('tier-1-event-config', '{not-json');
      expect(getSwanConfig().eventName).to.equal('Event');
    });
  });
});
