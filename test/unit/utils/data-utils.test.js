import { expect } from '@esm-bundle/chai';

import { getRsvpPayload } from '../../../event-libs/v1/utils/data-utils.js';

describe('data-utils', () => {
  describe('getRsvpPayload', () => {
    it('builds one flat payload with base, event and custom fields plus registrationStatus', () => {
      const payload = getRsvpPayload({
        attendeeId: 'a1',
        firstName: 'Jane',
        email: 'jane@example.com',
        requiresTicket: true,
        companyName: 'Acme',
      }, 'registered');

      expect(payload).to.deep.equal({
        attendeeId: 'a1',
        firstName: 'Jane',
        email: 'jane@example.com',
        requiresTicket: true,
        companyName: 'Acme',
        registrationStatus: 'registered',
      });
    });

    it('sends waitlisted status', () => {
      expect(getRsvpPayload({ firstName: 'Jane' }, 'waitlisted').registrationStatus).to.equal('waitlisted');
    });

    it('drops empty values and prototype-chain keys', () => {
      const data = JSON.parse('{"firstName":"Jane","lastName":"","company":null,"__proto__":{"x":1},"constructor":"c"}');
      const payload = getRsvpPayload(data, 'registered');

      expect(payload).to.deep.equal({ firstName: 'Jane', registrationStatus: 'registered' });
    });

    it('coerces boolean event fields from strings', () => {
      expect(getRsvpPayload({ shareInfoWithPartners: 'true' }, 'registered').shareInfoWithPartners).to.equal(true);
    });

    it('handles missing attendee data', () => {
      expect(getRsvpPayload(undefined, 'registered')).to.deep.equal({ registrationStatus: 'registered' });
    });
  });
});
