import { expect } from '@esm-bundle/chai';

import {
  getBaseAttendeePayload,
  getEventAttendeePayload,
  getRsvpTokenAttendeePayload,
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

  describe('getRsvpTokenAttendeePayload', () => {
    it('includes base attendee fields plus consent fields the guest submit endpoint accepts', () => {
      const out = getRsvpTokenAttendeePayload({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        consentStringId: 'cs3G;ve1;en',
        shareInfoWithPartners: true,
        ccSentiment: 'opt-in',
        requiresTicket: false,
      });
      expect(out).to.deep.equal({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        consentStringId: 'cs3G;ve1;en',
        shareInfoWithPartners: true,
        ccSentiment: 'opt-in',
        requiresTicket: false,
      });
    });

    it('coerces shareInfoWithPartners/requiresTicket from radio-group array (Yes/No)', () => {
      expect(getRsvpTokenAttendeePayload({ shareInfoWithPartners: ['Yes'] }).shareInfoWithPartners).to.be.true;
      expect(getRsvpTokenAttendeePayload({ requiresTicket: ['No'] }).requiresTicket).to.be.false;
    });

    it('never includes campaignId (server sources it from the token, never the client)', () => {
      const out = getRsvpTokenAttendeePayload({ firstName: 'Ada', campaignId: 'camp-1' });
      expect(out).to.not.have.property('campaignId');
    });

    it('drops unknown keys', () => {
      const out = getRsvpTokenAttendeePayload({ firstName: 'Ada', totallyMadeUpField: 'x' });
      expect(out).to.not.have.property('totallyMadeUpField');
    });

    it('returns argument unchanged when falsy', () => {
      expect(getRsvpTokenAttendeePayload(null)).to.equal(null);
      expect(getRsvpTokenAttendeePayload(undefined)).to.equal(undefined);
    });
  });
});
