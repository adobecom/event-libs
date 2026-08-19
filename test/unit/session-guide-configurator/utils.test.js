import { expect } from '@esm-bundle/chai';
import {
  createSessionGuideConfigURL,
  readConfigLinkPayload,
  rowFromConfigLinkPayload,
} from '../../../event-libs/session-guide-configurator/utils.js';

function makeRow(overrides = {}) {
  return {
    configId: 'cfg-1',
    componentName: 'MAX 26 — Widget',
    eventId: 'event-1',
    backendEventTitle: 'Adobe MAX 2026',
    eventServiceEnv: 'stage',
    config: {
      eventId: 'event-1',
      surface: 'widget',
      theme: 'dark',
      swimlaneOrder: [{ track: 'Design', displayName: 'Design', enabled: true }],
    },
    ...overrides,
  };
}

describe('session-guide-configurator utils', () => {
  describe('createSessionGuideConfigURL', () => {
    it('targets the consolidated Event Configurator page for the given org/repo', () => {
      const url = new URL(createSessionGuideConfigURL(makeRow(), 'myorg', 'myrepo'));
      expect(url.origin).to.equal('https://da.live');
      expect(url.pathname).to.equal('/app/myorg/myrepo/tools/da-apps/tier-1-event-configurator');
    });

    it('puts the payload in the hash, not a query param — DA only forwards the hash', () => {
      const url = new URL(createSessionGuideConfigURL(makeRow(), 'o', 'r'));
      expect(url.hash).to.match(/^#sgConfig=/);
      expect(url.searchParams.get('sgConfig')).to.equal(null);
    });

    it('carries the row identity alongside the config so the link can re-open it', () => {
      const url = createSessionGuideConfigURL(makeRow(), 'o', 'r');
      const payload = readConfigLinkPayload(new URL(url).hash);
      expect(payload.configId).to.equal('cfg-1');
      expect(payload.componentName).to.equal('MAX 26 — Widget');
      expect(payload.backendEventTitle).to.equal('Adobe MAX 2026');
      expect(payload.eventServiceEnv).to.equal('stage');
    });

    it('preserves the config blob the block consumes', () => {
      const url = createSessionGuideConfigURL(makeRow(), 'o', 'r');
      const payload = readConfigLinkPayload(new URL(url).hash);
      expect(payload.surface).to.equal('widget');
      expect(payload.theme).to.equal('dark');
      expect(payload.swimlaneOrder).to.deep.equal([
        { track: 'Design', displayName: 'Design', enabled: true },
      ]);
    });

    it('omits row fields the row does not have, rather than writing empty strings', () => {
      const row = makeRow({ componentName: '', eventServiceEnv: undefined });
      const payload = readConfigLinkPayload(new URL(createSessionGuideConfigURL(row, 'o', 'r')).hash);
      expect(payload).to.not.have.property('componentName');
      expect(payload).to.not.have.property('eventServiceEnv');
    });

    it('survives non-Latin1 characters in authored text', () => {
      const row = makeRow({ componentName: 'Sesión — Diseño ✨' });
      const payload = readConfigLinkPayload(new URL(createSessionGuideConfigURL(row, 'o', 'r')).hash);
      expect(payload.componentName).to.equal('Sesión — Diseño ✨');
    });
  });

  describe('readConfigLinkPayload', () => {
    it('returns null when the hash carries no config', () => {
      expect(readConfigLinkPayload('')).to.equal(null);
      expect(readConfigLinkPayload('#somethingElse=abc')).to.equal(null);
    });

    it('ignores a truncated payload instead of throwing', () => {
      expect(readConfigLinkPayload('#sgConfig=eyJhIjox')).to.equal(null);
    });

    it('ignores a payload that decodes to something other than an object', () => {
      const encoded = window.btoa(unescape(encodeURIComponent(JSON.stringify('just a string'))));
      expect(readConfigLinkPayload(`#sgConfig=${encoded}`)).to.equal(null);
    });

    it('reads a payload that is not the first key in the hash', () => {
      const url = createSessionGuideConfigURL(makeRow(), 'o', 'r');
      const encoded = new URL(url).hash.replace(/^#sgConfig=/, '');
      expect(readConfigLinkPayload(`#other=1&sgConfig=${encoded}`).configId).to.equal('cfg-1');
    });
  });

  describe('rowFromConfigLinkPayload', () => {
    it('round-trips a row through the link when it is not in the local library', () => {
      const original = makeRow();
      const url = createSessionGuideConfigURL(original, 'o', 'r');
      const rebuilt = rowFromConfigLinkPayload(readConfigLinkPayload(new URL(url).hash));
      expect(rebuilt.configId).to.equal(original.configId);
      expect(rebuilt.componentName).to.equal(original.componentName);
      expect(rebuilt.eventId).to.equal(original.eventId);
      expect(rebuilt.backendEventTitle).to.equal(original.backendEventTitle);
      expect(rebuilt.eventServiceEnv).to.equal(original.eventServiceEnv);
      expect(rebuilt.config).to.deep.equal(original.config);
    });

    it('strips the row fields back out of the config, so they are not saved into it', () => {
      const url = createSessionGuideConfigURL(makeRow(), 'o', 'r');
      const rebuilt = rowFromConfigLinkPayload(readConfigLinkPayload(new URL(url).hash));
      expect(rebuilt.config).to.not.have.property('configId');
      expect(rebuilt.config).to.not.have.property('componentName');
      expect(rebuilt.config).to.not.have.property('backendEventTitle');
      expect(rebuilt.config).to.not.have.property('eventServiceEnv');
    });

    it('mints a configId and defaults the env for a payload authored without them', () => {
      const rebuilt = rowFromConfigLinkPayload({ eventId: 'event-9', surface: 'page' });
      expect(rebuilt.configId).to.be.a('string').with.length.greaterThan(0);
      expect(rebuilt.eventServiceEnv).to.equal('prod');
      expect(rebuilt.backendEventTitle).to.equal('event-9');
      expect(rebuilt.config).to.deep.equal({ eventId: 'event-9', surface: 'page' });
    });
  });
});
