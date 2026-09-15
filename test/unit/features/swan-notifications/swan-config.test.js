import { expect } from '@esm-bundle/chai';
import {
  getSwanMode, isGnavNotificationsEnabled, getSwanConfig,
} from '../../../../event-libs/v1/features/swan-notifications/swan-config.js';

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
    setMeta('gnav-notifications');
    setMeta('tier-1-event-config');
  });

  describe('getSwanMode', () => {
    it('is "off" when the swan-notifications metadata flag is absent', () => {
      expect(getSwanMode()).to.equal('off');
    });

    it('is "off" for any value other than the literal strings "feds" or "unc"', () => {
      setMeta('swan-notifications', 'true');
      expect(getSwanMode()).to.equal('off');
    });

    it('is "feds" once the flag is authored as "feds"', () => {
      setMeta('swan-notifications', 'feds');
      expect(getSwanMode()).to.equal('feds');
    });

    it('is "unc" once the flag is authored as "unc"', () => {
      setMeta('swan-notifications', 'unc');
      expect(getSwanMode()).to.equal('unc');
    });
  });

  describe('isGnavNotificationsEnabled', () => {
    it('is false when the gnav-notifications metadata flag is absent', () => {
      expect(isGnavNotificationsEnabled()).to.equal(false);
    });

    it('is false for any value other than the literal string "on"', () => {
      setMeta('gnav-notifications', 'true');
      expect(isGnavNotificationsEnabled()).to.equal(false);
    });

    it('is true once the flag is authored as "on"', () => {
      setMeta('gnav-notifications', 'on');
      expect(isGnavNotificationsEnabled()).to.equal(true);
    });
  });

  describe('getSwanConfig', () => {
    it('returns hardcoded defaults with a generic event name when no tier-1-event-config is present', () => {
      const config = getSwanConfig();
      expect(config.eventName).to.equal('Event');
      expect(config.upcomingOffsetMinutes).to.equal(5);
      expect(config.defaultNotificationIconUrl).to.equal('');
      expect(config.localNotificationPersistTillDays).to.equal(3);
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
