import { expect } from '@esm-bundle/chai';

import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import {
  applyImplicitContactMethodsToPayload,
  getImplicitConsentRaw,
  parseImplicitConsentChannels,
} from '../../../event-libs/v1/utils/rsvp-consent.js';

describe('rsvp-consent', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  describe('parseImplicitConsentChannels', () => {
    it('returns email and phone in stable order for "email, phone"', () => {
      expect(parseImplicitConsentChannels('email, phone')).to.deep.equal(['email', 'phone']);
    });

    it('normalizes case and extra spaces', () => {
      expect(parseImplicitConsentChannels('  Email  ;  PHONE  ')).to.deep.equal(['email', 'phone']);
    });

    it('returns a single channel', () => {
      expect(parseImplicitConsentChannels('email')).to.deep.equal(['email']);
      expect(parseImplicitConsentChannels('phone')).to.deep.equal(['phone']);
    });

    it('dedupes repeated tokens', () => {
      expect(parseImplicitConsentChannels('email, email, phone')).to.deep.equal(['email', 'phone']);
    });

    it('drops unknown tokens', () => {
      expect(parseImplicitConsentChannels('email, fax, phone')).to.deep.equal(['email', 'phone']);
    });

    it('returns empty array for empty or invalid input', () => {
      expect(parseImplicitConsentChannels('')).to.deep.equal([]);
      expect(parseImplicitConsentChannels('   ')).to.deep.equal([]);
      expect(parseImplicitConsentChannels(null)).to.deep.equal([]);
      expect(parseImplicitConsentChannels(undefined)).to.deep.equal([]);
    });

    it('orders phone before email in output as email, phone per stable sort', () => {
      expect(parseImplicitConsentChannels('phone, email')).to.deep.equal(['email', 'phone']);
    });
  });

  describe('getImplicitConsentRaw', () => {
    it('prefers fragment meta over index and page', () => {
      const tw = document.createElement('div');
      tw.innerHTML = '<meta name="implicit-consent" content="email, phone">';
      setMetadata('implicit-consent', 'phone', document);
      const raw = getImplicitConsentRaw(tw, { implicitConsent: 'email' });
      expect(raw).to.equal('email, phone');
    });

    it('uses index when no fragment meta', () => {
      const tw = document.createElement('div');
      expect(getImplicitConsentRaw(tw, { implicitConsent: 'phone' })).to.equal('phone');
      expect(getImplicitConsentRaw(tw, { implicit_consent: 'email' })).to.equal('email');
    });

    it('falls back to page meta', () => {
      const tw = document.createElement('div');
      setMetadata('implicit-consent', 'email; phone', document);
      expect(getImplicitConsentRaw(tw, {})).to.equal('email; phone');
    });

    it('returns empty string when nothing is set', () => {
      expect(getImplicitConsentRaw(document.createElement('div'), {})).to.equal('');
    });
  });

  describe('applyImplicitContactMethodsToPayload', () => {
    it('fills contactMethods from dataset when no checkboxes', () => {
      const form = document.createElement('form');
      const cm = document.createElement('div');
      cm.setAttribute('data-field-id', 'contactMethods');
      const tw = document.createElement('div');
      tw.className = 'terms-and-conditions-wrapper';
      tw.dataset.implicitConsent = 'email, phone';
      form.append(cm, tw);

      const payload = {};
      applyImplicitContactMethodsToPayload(form, payload);
      expect(payload.contactMethods).to.deep.equal(['email', 'phone']);
    });

    it('does not override existing contactMethods', () => {
      const form = document.createElement('form');
      const cm = document.createElement('div');
      cm.setAttribute('data-field-id', 'contactMethods');
      const tw = document.createElement('div');
      tw.className = 'terms-and-conditions-wrapper';
      tw.dataset.implicitConsent = 'email, phone';
      form.append(cm, tw);

      const payload = { contactMethods: ['email'] };
      applyImplicitContactMethodsToPayload(form, payload);
      expect(payload.contactMethods).to.deep.equal(['email']);
    });

    it('does nothing when contactMethods checkboxes exist', () => {
      const form = document.createElement('form');
      const cm = document.createElement('div');
      cm.setAttribute('data-field-id', 'contactMethods');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cm.appendChild(cb);
      const tw = document.createElement('div');
      tw.className = 'terms-and-conditions-wrapper';
      tw.dataset.implicitConsent = 'email, phone';
      form.append(cm, tw);

      const payload = {};
      applyImplicitContactMethodsToPayload(form, payload);
      expect(payload.contactMethods).to.be.undefined;
    });

    it('uses page meta when dataset is empty', () => {
      const form = document.createElement('form');
      const cm = document.createElement('div');
      cm.setAttribute('data-field-id', 'contactMethods');
      const tw = document.createElement('div');
      tw.className = 'terms-and-conditions-wrapper';
      form.append(cm, tw);
      setMetadata('implicit-consent', 'phone', document);

      const payload = {};
      applyImplicitContactMethodsToPayload(form, payload);
      expect(payload.contactMethods).to.deep.equal(['phone']);
    });
  });
});
