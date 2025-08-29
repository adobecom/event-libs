import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

describe('Adobe Event Service API', () => {
  let api;
  let sandbox;

  before(async () => {
    api = await import('../../../event-libs/v1/utils/esp-controller.js');
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('getCaasTags', () => {
    it('should fetch CAAS tags', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });
      const tags = await api.getCaasTags();
      expect(tags).to.be.an('object');
    });
  });

  describe('waitForAdobeIMS', () => {
    it('should resolve when adobeIMS is available', async () => {
      window.adobeIMS = { getAccessToken: () => ({ token: 'fake-token' }) };
      await api.waitForAdobeIMS();
      expect(window.adobeIMS.getAccessToken()).to.have.property('token', 'fake-token');
    });
  });

  describe('constructRequestOptions', () => {
    it('should construct request options with auth token', async () => {
      window.adobeIMS = { getAccessToken: () => ({ token: 'fake-token' }) };
      const options = await api.constructRequestOptions('GET');
      expect(options).to.be.an('object');
      expect(options).to.have.property('method', 'GET');
      expect(options.headers.get('Authorization')).to.equal('Bearer fake-token');
    });
  });

  describe('getEvent', () => {
    it('should fetch event details', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({ eventId: '123' }), ok: true });
      const event = await api.getEvent('123');
      expect(event).to.be.an('object');
      expect(event.data).to.have.property('eventId', '123');
    });
  });

  describe('getAttendee', () => {
    it('should fetch attendee details', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({ attendeeId: '456' }), ok: true });
      const attendee = await api.getAttendee('123');
      expect(attendee).to.be.an('object');
      expect(attendee.data).to.have.property('attendeeId', '456');
    });

    it('should return an error if attendee details are not found', async () => {
      sandbox.stub(window, 'fetch').resolves({ text: () => 'Attendee not found', ok: false });
      const error = await api.getAttendee('123');
      expect(error).to.be.an('object');
      expect(error.error).to.equal('Attendee not found');
    });
  });

  describe('getEventAttendee', () => {
    it('should fetch event attendee details', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({ attendeeId: '456' }), ok: true });
      const attendee = await api.getEventAttendee('123');
      expect(attendee).to.be.an('object');
      expect(attendee.data).to.have.property('attendeeId', '456');
    });

    it('should return an error if attendee details are not found', async () => {
      sandbox.stub(window, 'fetch').resolves({ text: () => 'Attendee not found', ok: false });
      const error = await api.getEventAttendee('123');
      expect(error).to.be.an('object');
      expect(error.error).to.equal('Attendee not found');
    });
  });

  describe('createAttendee', () => {
    it('should create an attendee and receive complete attendee data', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });

      const rsvpData = await api.createAttendee({ name: 'John Doe' });
      expect(rsvpData.data).to.be.an('object');
    });

    it('should return an error if attendee creation fails', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: false });

      const error = await api.createAttendee({ name: 'John Doe' });
      expect(error).to.be.an('object');
      expect(error.ok).to.be.false;
    });
  });

  describe('addAttendeeToEvent', () => {
    it('should add an attendee to an event and receive complete attendee data', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });

      const rsvpData = await api.addAttendeeToEvent('123', { name: 'John Doe' });
      expect(rsvpData.data).to.be.an('object');
    });

    it('should return an error if attendee addition fails', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: false });

      const error = await api.addAttendeeToEvent('123', { name: 'John Doe' });
      expect(error).to.be.an('object');
      expect(error.ok).to.be.false;
    });
  });

  describe('updateAttendee', () => {
    it('should update attendee details and fetch complete attendee data', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });
      const rsvpData = await api.updateAttendee('123', { name: 'John Doe' });
      expect(rsvpData.data).to.be.an('object');
    });

    it('should return an error if attendee update fails', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: false });
      const error = await api.updateAttendee('123', { name: 'John Doe' });
      expect(error).to.be.an('object');
      expect(error.ok).to.be.false;
    });
  });

  describe('deleteAttendeeFromEvent', () => {
    it('should delete an attendee and fetch complete attendee data', async () => {
      sandbox.stub(window, 'fetch').onFirstCall().resolves({ json: () => ({}), ok: true });

      const rsvpData = await api.deleteAttendeeFromEvent('123');
      expect(rsvpData.data).to.be.an('object');
    });

    it('should return an error if attendee deletion fails', async () => {
      sandbox.stub(window, 'fetch').onFirstCall().resolves({ json: () => ({}), ok: false });

      const error = await api.deleteAttendeeFromEvent('123');
      expect(error).to.be.an('object');
      expect(error.ok).to.be.false;
    });
  });
});
