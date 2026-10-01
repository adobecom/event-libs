import { expect } from '@esm-bundle/chai';

import {
  getBaseAttendeePayload,
  getEventAttendeePayload,
  getUnrecognizedAttendeeFields,
  sanitizeLegacyPhoneFields,
} from '../../../event-libs/v1/utils/data-utils.js';

describe('data-utils', () => {
  describe('getEventAttendeePayload', () => {
    it('includes requiresTicket when true', () => {
      const out = getEventAttendeePayload({
        email: 'a@b.com',
        requiresTicket: true,
        unknownCustomFlag: true,
      });
      expect(out.requiresTicket).to.be.true;
      expect(out).to.not.have.property('unknownCustomFlag');
    });

    it('includes requiresTicket when false', () => {
      const out = getEventAttendeePayload({
        requiresTicket: false,
      });
      expect(out.requiresTicket).to.be.false;
    });

    it('coerces requiresTicket from radio-group array (Yes/No)', () => {
      expect(getEventAttendeePayload({ requiresTicket: ['Yes'] }).requiresTicket).to.be.true;
      expect(getEventAttendeePayload({ requiresTicket: ['No'] }).requiresTicket).to.be.false;
    });

    it('coerces requiresTicket from string Yes/No', () => {
      expect(getEventAttendeePayload({ requiresTicket: 'Yes' }).requiresTicket).to.be.true;
      expect(getEventAttendeePayload({ requiresTicket: 'No' }).requiresTicket).to.be.false;
    });

    it('omits requiresTicket when empty array (optional unanswered)', () => {
      const out = getEventAttendeePayload({ requiresTicket: [] });
      expect(out).to.not.have.property('requiresTicket');
    });

    it('drops unknown keys', () => {
      const out = getEventAttendeePayload({
        firstName: 'Ada',
        totallyMadeUpField: 'x',
      });
      expect(out.firstName).to.equal('Ada');
      expect(out).to.not.have.property('totallyMadeUpField');
    });

    it('returns argument unchanged when falsy', () => {
      expect(getEventAttendeePayload(null)).to.equal(null);
      expect(getEventAttendeePayload(undefined)).to.equal(undefined);
    });

    it('includes phoneticFirstName and phoneticLastName when present', () => {
      const out = getEventAttendeePayload({
        firstName: 'Sharmee',
        lastName: 'Biswas',
        email: 'sharmeeb@adobe.com',
        registrationStatus: 'registered',
        phoneticFirstName: 'Shar-me',
        phoneticLastName: 'Bis-wass',
      });
      expect(out.phoneticFirstName).to.equal('Shar-me');
      expect(out.phoneticLastName).to.equal('Bis-wass');
    });
  });

  describe('getBaseAttendeePayload', () => {
    it('includes phoneticFirstName and phoneticLastName when present', () => {
      const out = getBaseAttendeePayload({
        firstName: 'Sharmee',
        lastName: 'Biswas',
        email: 'sharmeeb@adobe.com',
        phoneticFirstName: 'Shar-me',
        phoneticLastName: 'Bis-wass',
      });
      expect(out.phoneticFirstName).to.equal('Shar-me');
      expect(out.phoneticLastName).to.equal('Bis-wass');
    });

    it('drops unknown keys not in the allow-list', () => {
      const out = getBaseAttendeePayload({
        firstName: 'Ada',
        totallyMadeUpField: 'x',
      });
      expect(out.firstName).to.equal('Ada');
      expect(out).to.not.have.property('totallyMadeUpField');
    });

    it('omits phonetic fields when empty', () => {
      const out = getBaseAttendeePayload({
        firstName: 'Ada',
        phoneticFirstName: '',
      });
      expect(out).to.not.have.property('phoneticFirstName');
    });

    it('returns argument unchanged when falsy', () => {
      expect(getBaseAttendeePayload(null)).to.equal(null);
      expect(getBaseAttendeePayload(undefined)).to.equal(undefined);
    });
  });

  describe('sanitizeLegacyPhoneFields', () => {
    it('drops an existing phone field with a legacy invalid value when the form does not submit it', () => {
      const out = sanitizeLegacyPhoneFields(
        { attendeeId: 'att-1', businessPhone: 'None' },
        { firstName: 'Ada' },
      );
      expect(out).to.not.have.property('businessPhone');
      expect(out.attendeeId).to.equal('att-1');
    });

    it('keeps an existing phone field with a legacy invalid value when the form does submit that same field', () => {
      const out = sanitizeLegacyPhoneFields(
        { businessPhone: 'None' },
        { businessPhone: '+1 555 123 4567' },
      );
      expect(out.businessPhone).to.equal('None');
    });

    it('keeps an existing phone field whose value already matches the backend pattern', () => {
      const out = sanitizeLegacyPhoneFields(
        { mobilePhone: '+1 (555) 123-4567' },
        {},
      );
      expect(out.mobilePhone).to.equal('+1 (555) 123-4567');
    });

    it('leaves non-phone fields untouched regardless of value', () => {
      const out = sanitizeLegacyPhoneFields(
        { companyName: 'N/A' },
        {},
      );
      expect(out.companyName).to.equal('N/A');
    });

    it('does not treat phoneticFirstName/phoneticLastName as phone fields', () => {
      const out = sanitizeLegacyPhoneFields(
        { phoneticFirstName: 'Jon', phoneticLastName: 'Sno' },
        {},
      );
      expect(out.phoneticFirstName).to.equal('Jon');
      expect(out.phoneticLastName).to.equal('Sno');
    });

    it('drops multiple stale invalid phone fields at once when neither is submitted', () => {
      const out = sanitizeLegacyPhoneFields(
        { mobilePhone: 'None', businessPhone: 'N/A' },
        { firstName: 'Ada' },
      );
      expect(out).to.not.have.property('mobilePhone');
      expect(out).to.not.have.property('businessPhone');
    });

    it('does not strip a non-string legacy phone value', () => {
      const out = sanitizeLegacyPhoneFields(
        { mobilePhone: null },
        {},
      );
      expect(out).to.have.property('mobilePhone', null);
    });

    it('returns argument unchanged when falsy', () => {
      expect(sanitizeLegacyPhoneFields(null, {})).to.equal(null);
      expect(sanitizeLegacyPhoneFields(undefined, {})).to.equal(undefined);
    });

    it('treats a missing newData as "not submitted" for every existing field', () => {
      const out = sanitizeLegacyPhoneFields({ businessPhone: 'None' }, undefined);
      expect(out).to.not.have.property('businessPhone');
    });
  });

  describe('getUnrecognizedAttendeeFields', () => {
    it('returns fields not recognized by either filter', () => {
      const out = getUnrecognizedAttendeeFields({
        firstName: 'Ada',
        customEventQuestion: 'Yes, I will attend the workshop',
      });
      expect(out).to.deep.equal({ customEventQuestion: 'Yes, I will attend the workshop' });
    });

    it('excludes fields recognized by the base attendee filter even when absent from the event filter', () => {
      const out = getUnrecognizedAttendeeFields({
        jobTitle: 'Engineer',
        customField: 'x',
      });
      expect(out).to.deep.equal({ customField: 'x' });
    });

    it('excludes fields recognized by the event attendee filter', () => {
      const out = getUnrecognizedAttendeeFields({
        requiresTicket: true,
        customField: 'x',
      });
      expect(out).to.deep.equal({ customField: 'x' });
    });

    it('drops invalid values (empty string, null, undefined)', () => {
      const out = getUnrecognizedAttendeeFields({
        customField: '',
        anotherCustomField: null,
        thirdCustomField: undefined,
        keepMe: 'value',
      });
      expect(out).to.deep.equal({ keepMe: 'value' });
    });

    it('returns an empty object when falsy', () => {
      expect(getUnrecognizedAttendeeFields(null)).to.deep.equal({});
      expect(getUnrecognizedAttendeeFields(undefined)).to.deep.equal({});
    });

    it('excludes a key recognized by both filters', () => {
      const out = getUnrecognizedAttendeeFields({
        firstName: 'Ada',
        customField: 'x',
      });
      expect(out).to.deep.equal({ customField: 'x' });
    });

    it('rejects prototype-chain property names', () => {
      const out = getUnrecognizedAttendeeFields(JSON.parse('{"__proto__":{"polluted":true},"constructor":"x","customField":"y"}'));
      expect(out).to.deep.equal({ customField: 'y' });
      expect({}.polluted).to.be.undefined;
    });
  });
});
