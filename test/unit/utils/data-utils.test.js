import { expect } from '@esm-bundle/chai';

import { getEventAttendeePayload } from '../../../event-libs/v1/utils/data-utils.js';

describe('data-utils', () => {
  describe('getEventAttendeePayload', () => {
    it('includes requiresSxswTicket when true', () => {
      const out = getEventAttendeePayload({
        email: 'a@b.com',
        requiresSxswTicket: true,
        unknownCustomFlag: true,
      });
      expect(out.requiresSxswTicket).to.be.true;
      expect(out).to.not.have.property('unknownCustomFlag');
    });

    it('includes requiresSxswTicket when false', () => {
      const out = getEventAttendeePayload({
        requiresSxswTicket: false,
      });
      expect(out.requiresSxswTicket).to.be.false;
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
