import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import BlockMediator from '../../../event-libs/v1/deps/block-mediator.min.js';

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

  describe('getCampaign', () => {
    it('should fetch campaign details', async () => {
      const campaignData = {
        campaignId: 'camp-1',
        name: 'Test Campaign',
        status: 'Active',
        attendeeLimit: 100,
        attendeeCount: 50,
        waitlistAttendeeCount: 0,
      };
      sandbox.stub(window, 'fetch').resolves({ json: () => campaignData, ok: true });

      const result = await api.getCampaign('event-1', 'camp-1');
      expect(result.ok).to.be.true;
      expect(result.data).to.deep.equal(campaignData);
    });

    it('should return an error if campaign fetch fails', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({ message: 'Not found' }), ok: false, status: 404 });

      const result = await api.getCampaign('event-1', 'camp-1');
      expect(result.ok).to.be.false;
      expect(result.status).to.equal(404);
    });

    it('should handle network errors', async () => {
      sandbox.stub(window, 'fetch').rejects(new Error('Network failure'));

      const result = await api.getCampaign('event-1', 'camp-1');
      expect(result.ok).to.be.false;
      expect(result.status).to.equal('Network Error');
    });
  });

  describe('getAndCreateAndAddAttendee', () => {
    const eventId = 'event-123';
    const attendeeData = { firstName: 'John', lastName: 'Doe', email: 'john@test.com' };
    const attendeeResp = { attendeeId: 'att-1', firstName: 'John', lastName: 'Doe', email: 'john@test.com' };

    beforeEach(() => {
      BlockMediator.set('imsProfile', { account_type: 'type1' });
    });

    it('should register when event is not full and no campaign', async () => {
      const fetchStub = sandbox.stub(window, 'fetch');
      fetchStub.onCall(0).resolves({ json: () => ({ eventId, isFull: false }), ok: true });
      fetchStub.onCall(1).resolves({ json: () => (attendeeResp), ok: true, status: 200 });
      fetchStub.onCall(2).resolves({ json: () => (attendeeResp), ok: true });
      fetchStub.onCall(3).resolves({ json: () => ({ registrationStatus: 'registered' }), ok: true });

      const result = await api.getAndCreateAndAddAttendee(eventId, attendeeData);
      expect(result.ok).to.be.true;
      expect(result.data.registrationStatus).to.equal('registered');
    });

    it('should waitlist when event is full regardless of campaign', async () => {
      BlockMediator.set('imsProfile', { account_type: 'guest' });
      const fetchStub = sandbox.stub(window, 'fetch');
      fetchStub.onCall(0).resolves({ json: () => ({ eventId, isFull: true }), ok: true });
      fetchStub.onCall(1).resolves({ json: () => (attendeeResp), ok: true });
      fetchStub.onCall(2).resolves({ json: () => ({ registrationStatus: 'waitlisted' }), ok: true });

      const dataWithCampaign = { ...attendeeData, campaignId: 'camp-1' };
      const result = await api.getAndCreateAndAddAttendee(eventId, dataWithCampaign);
      expect(result.ok).to.be.true;
      expect(fetchStub.callCount).to.equal(3);
    });

    it('should register with campaign when campaign has no attendeeLimit', async () => {
      BlockMediator.set('imsProfile', { account_type: 'guest' });
      const fetchStub = sandbox.stub(window, 'fetch');
      fetchStub.onCall(0).resolves({ json: () => ({ eventId, isFull: false }), ok: true });
      fetchStub.onCall(1).resolves({ json: () => (attendeeResp), ok: true });
      fetchStub.onCall(2).resolves({
        json: () => ({ campaignId: 'camp-1', attendeeCount: 50, waitlistAttendeeCount: 0 }),
        ok: true,
      });
      fetchStub.onCall(3).resolves({ json: () => ({ registrationStatus: 'registered', campaignId: 'camp-1' }), ok: true });

      const dataWithCampaign = { ...attendeeData, campaignId: 'camp-1' };
      const result = await api.getAndCreateAndAddAttendee(eventId, dataWithCampaign);
      expect(result.ok).to.be.true;
      expect(result.data.registrationStatus).to.equal('registered');
    });

    it('should register when campaign has capacity and no waitlist', async () => {
      BlockMediator.set('imsProfile', { account_type: 'guest' });
      const fetchStub = sandbox.stub(window, 'fetch');
      fetchStub.onCall(0).resolves({ json: () => ({ eventId, isFull: false }), ok: true });
      fetchStub.onCall(1).resolves({ json: () => (attendeeResp), ok: true });
      fetchStub.onCall(2).resolves({
        json: () => ({ campaignId: 'camp-1', attendeeLimit: 100, attendeeCount: 50, waitlistAttendeeCount: 0 }),
        ok: true,
      });
      fetchStub.onCall(3).resolves({ json: () => ({ registrationStatus: 'registered', campaignId: 'camp-1' }), ok: true });

      const dataWithCampaign = { ...attendeeData, campaignId: 'camp-1' };
      const result = await api.getAndCreateAndAddAttendee(eventId, dataWithCampaign);
      expect(result.ok).to.be.true;
      expect(result.data.registrationStatus).to.equal('registered');
    });

    it('should waitlist when campaign attendeeLimit equals attendeeCount', async () => {
      BlockMediator.set('imsProfile', { account_type: 'guest' });
      const fetchStub = sandbox.stub(window, 'fetch');
      fetchStub.onCall(0).resolves({ json: () => ({ eventId, isFull: false }), ok: true });
      fetchStub.onCall(1).resolves({ json: () => (attendeeResp), ok: true });
      fetchStub.onCall(2).resolves({
        json: () => ({ campaignId: 'camp-1', attendeeLimit: 100, attendeeCount: 100, waitlistAttendeeCount: 0 }),
        ok: true,
      });
      fetchStub.onCall(3).resolves({ json: () => ({ registrationStatus: 'waitlisted', campaignId: 'camp-1' }), ok: true });

      const dataWithCampaign = { ...attendeeData, campaignId: 'camp-1' };
      const result = await api.getAndCreateAndAddAttendee(eventId, dataWithCampaign);
      expect(result.ok).to.be.true;
      expect(result.data.registrationStatus).to.equal('waitlisted');
    });

    it('should waitlist when campaign has capacity but waitlist backlog exists', async () => {
      BlockMediator.set('imsProfile', { account_type: 'guest' });
      const fetchStub = sandbox.stub(window, 'fetch');
      fetchStub.onCall(0).resolves({ json: () => ({ eventId, isFull: false }), ok: true });
      fetchStub.onCall(1).resolves({ json: () => (attendeeResp), ok: true });
      fetchStub.onCall(2).resolves({
        json: () => ({ campaignId: 'camp-1', attendeeLimit: 100, attendeeCount: 80, waitlistAttendeeCount: 5 }),
        ok: true,
      });
      fetchStub.onCall(3).resolves({ json: () => ({ registrationStatus: 'waitlisted', campaignId: 'camp-1' }), ok: true });

      const dataWithCampaign = { ...attendeeData, campaignId: 'camp-1' };
      const result = await api.getAndCreateAndAddAttendee(eventId, dataWithCampaign);
      expect(result.ok).to.be.true;
      expect(result.data.registrationStatus).to.equal('waitlisted');
    });

    it('should fall back to event-level status when campaign lookup fails', async () => {
      BlockMediator.set('imsProfile', { account_type: 'guest' });
      const fetchStub = sandbox.stub(window, 'fetch');
      fetchStub.onCall(0).resolves({ json: () => ({ eventId, isFull: false }), ok: true });
      fetchStub.onCall(1).resolves({ json: () => (attendeeResp), ok: true });
      fetchStub.onCall(2).resolves({ json: () => ({ message: 'Not found' }), ok: false, status: 404 });
      fetchStub.onCall(3).resolves({ json: () => ({ registrationStatus: 'registered', campaignId: 'camp-1' }), ok: true });

      const dataWithCampaign = { ...attendeeData, campaignId: 'camp-1' };
      const result = await api.getAndCreateAndAddAttendee(eventId, dataWithCampaign);
      expect(result.ok).to.be.true;
      expect(result.data.registrationStatus).to.equal('registered');
    });
  });
});
