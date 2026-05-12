import { expect } from '@esm-bundle/chai';

import { getEventAttendeePayload } from '../../../event-libs/v1/utils/data-utils.js';

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
  });
});
