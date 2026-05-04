import { expect } from '@esm-bundle/chai';
import {
  IMPLICIT_CONSENT_GRANTED,
  parseImplicitConsentMetaContent,
  applyImplicitConsentToPayload,
} from '../../../event-libs/v1/utils/rsvp-consent.js';

describe('rsvp-consent', () => {
  describe('parseImplicitConsentMetaContent', () => {
    it('should parse email and phone', () => {
      expect(parseImplicitConsentMetaContent('email, phone')).to.deep.equal({
        email: true,
        phone: true,
      });
    });

    it('should parse email only', () => {
      expect(parseImplicitConsentMetaContent('email')).to.deep.equal({
        email: true,
        phone: false,
      });
    });

    it('should parse phone only', () => {
      expect(parseImplicitConsentMetaContent('phone')).to.deep.equal({
        email: false,
        phone: true,
      });
    });

    it('should trim tokens and be case-insensitive', () => {
      expect(parseImplicitConsentMetaContent(' Email , PHONE ')).to.deep.equal({
        email: true,
        phone: true,
      });
    });

    it('should return false flags for empty input', () => {
      expect(parseImplicitConsentMetaContent('')).to.deep.equal({
        email: false,
        phone: false,
      });
      expect(parseImplicitConsentMetaContent(undefined)).to.deep.equal({
        email: false,
        phone: false,
      });
    });
  });

  describe('applyImplicitConsentToPayload', () => {
    it('should set consent when meta present and no contactMethod checkboxes', () => {
      const form = document.createElement('form');
      const terms = document.createElement('div');
      terms.className = 'terms-and-conditions-wrapper';
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'implicit-consent');
      meta.setAttribute('content', 'email, phone');
      terms.appendChild(meta);
      form.appendChild(terms);

      const payload = {};
      applyImplicitConsentToPayload(form, payload);
      expect(payload.emailConsent).to.equal(IMPLICIT_CONSENT_GRANTED);
      expect(payload.phoneConsent).to.equal(IMPLICIT_CONSENT_GRANTED);
    });

    it('should not set consent when contactMethods checkboxes exist', () => {
      const form = document.createElement('form');
      const terms = document.createElement('div');
      terms.className = 'terms-and-conditions-wrapper';
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'implicit-consent');
      meta.setAttribute('content', 'email, phone');
      terms.appendChild(meta);
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.name = 'contactMethods';
      cb.value = 'email';
      terms.appendChild(cb);
      form.appendChild(terms);

      const payload = {};
      applyImplicitConsentToPayload(form, payload);
      expect(payload).to.not.have.property('emailConsent');
      expect(payload).to.not.have.property('phoneConsent');
    });

    it('should find meta on form when not inside terms wrapper', () => {
      const form = document.createElement('form');
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'implicit-consent');
      meta.setAttribute('content', 'email');
      form.appendChild(meta);

      const payload = {};
      applyImplicitConsentToPayload(form, payload);
      expect(payload.emailConsent).to.equal(IMPLICIT_CONSENT_GRANTED);
      expect(payload).to.not.have.property('phoneConsent');
    });
  });
});
