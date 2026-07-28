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

    it('should prefer the setEspAuthToken override over window.adobeIMS', async () => {
      window.adobeIMS = { getAccessToken: () => ({ token: 'ims-token' }) };
      api.setEspAuthToken('override-token');
      try {
        const options = await api.constructRequestOptions('GET');
        expect(options.headers.get('Authorization')).to.equal('Bearer override-token');
      } finally {
        api.setEspAuthToken(null);
      }
    });

    it('should fall back to window.adobeIMS once the override is cleared', async () => {
      window.adobeIMS = { getAccessToken: () => ({ token: 'ims-token' }) };
      api.setEspAuthToken('override-token');
      api.setEspAuthToken(null);
      const options = await api.constructRequestOptions('GET');
      expect(options.headers.get('Authorization')).to.equal('Bearer ims-token');
    });

    it('should omit Authorization entirely when skipAuth is true, even with an override set', async () => {
      window.adobeIMS = { getAccessToken: () => ({ token: 'ims-token' }) };
      api.setEspAuthToken('override-token');
      try {
        const options = await api.constructRequestOptions('GET', null, true, true);
        expect(options.headers.has('Authorization')).to.be.false;
      } finally {
        api.setEspAuthToken(null);
      }
    });

    it('should omit the Authorization header when skipAuth is true, even with a signed-in session', async () => {
      window.adobeIMS = { getAccessToken: () => ({ token: 'fake-token' }) };
      const options = await api.constructRequestOptions('GET', null, false, true);
      expect(options.headers.has('Authorization')).to.be.false;
    });

    it('should attach the x-adobe-esp-rsvp-token header when an RSVP token is passed', async () => {
      const options = await api.constructRequestOptions('GET', null, false, true, 'tok-1');
      expect(options.headers.get('x-adobe-esp-rsvp-token')).to.equal('tok-1');
    });

    it('should omit the RSVP token header when no RSVP token is passed', async () => {
      const options = await api.constructRequestOptions('GET');
      expect(options.headers.has('x-adobe-esp-rsvp-token')).to.be.false;
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

    it('should send both the guest IMS token and the rsvp-token header when a token is passed', async () => {
      window.adobeIMS = { getAccessToken: () => ({ token: 'fake-token', isGuestToken: true }) };
      const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });

      await api.createAttendee({ name: 'John Doe' }, 'tok-1');

      const options = fetchStub.firstCall.args[1];
      expect(options.headers.get('x-adobe-esp-rsvp-token')).to.equal('tok-1');
      expect(options.headers.get('Authorization')).to.equal('Bearer fake-token');
    });

    it('should omit the Authorization header (but keep the rsvp-token header) when the caller has a real signed-in session', async () => {
      window.adobeIMS = { getAccessToken: () => ({ token: 'assistants-own-token', isGuestToken: false }) };
      const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });

      await api.createAttendee({ name: 'John Doe' }, 'tok-1');

      const options = fetchStub.firstCall.args[1];
      expect(options.headers.get('x-adobe-esp-rsvp-token')).to.equal('tok-1');
      expect(options.headers.has('Authorization')).to.be.false;
    });

    it('should omit the rsvp-token header when no token is passed, and still authenticate via IMS', async () => {
      window.adobeIMS = { getAccessToken: () => ({ token: 'fake-token' }) };
      const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });

      await api.createAttendee({ name: 'John Doe' });

      const options = fetchStub.firstCall.args[1];
      expect(options.headers.get('Authorization')).to.equal('Bearer fake-token');
      expect(options.headers.has('x-adobe-esp-rsvp-token')).to.be.false;
    });

    it('should degrade gracefully (no throw, no Authorization) when a token is passed with no IMS session', async () => {
      delete window.adobeIMS;
      const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });

      await api.createAttendee({ name: 'John Doe' }, 'tok-1');

      const options = fetchStub.firstCall.args[1];
      expect(options.headers.get('x-adobe-esp-rsvp-token')).to.equal('tok-1');
      expect(options.headers.has('Authorization')).to.be.false;
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

    it('should send both the guest IMS token and the rsvp-token header when a token is passed', async () => {
      window.adobeIMS = { getAccessToken: () => ({ token: 'fake-token', isGuestToken: true }) };
      const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });

      await api.addAttendeeToEvent('123', { name: 'John Doe' }, 'tok-1');

      const options = fetchStub.firstCall.args[1];
      expect(options.headers.get('x-adobe-esp-rsvp-token')).to.equal('tok-1');
      expect(options.headers.get('Authorization')).to.equal('Bearer fake-token');
    });

    it('should omit the Authorization header (but keep the rsvp-token header) when the caller has a real signed-in session', async () => {
      window.adobeIMS = { getAccessToken: () => ({ token: 'assistants-own-token', isGuestToken: false }) };
      const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });

      await api.addAttendeeToEvent('123', { name: 'John Doe' }, 'tok-1');

      const options = fetchStub.firstCall.args[1];
      expect(options.headers.get('x-adobe-esp-rsvp-token')).to.equal('tok-1');
      expect(options.headers.has('Authorization')).to.be.false;
    });

    it('should omit the rsvp-token header when no token is passed, and still authenticate via IMS', async () => {
      window.adobeIMS = { getAccessToken: () => ({ token: 'fake-token' }) };
      const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });

      await api.addAttendeeToEvent('123', { name: 'John Doe' });

      const options = fetchStub.firstCall.args[1];
      expect(options.headers.get('Authorization')).to.equal('Bearer fake-token');
      expect(options.headers.has('x-adobe-esp-rsvp-token')).to.be.false;
    });

    it('should degrade gracefully (no throw, no Authorization) when a token is passed with no IMS session', async () => {
      delete window.adobeIMS;
      const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });

      await api.addAttendeeToEvent('123', { name: 'John Doe' }, 'tok-1');

      const options = fetchStub.firstCall.args[1];
      expect(options.headers.get('x-adobe-esp-rsvp-token')).to.equal('tok-1');
      expect(options.headers.has('Authorization')).to.be.false;
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

  describe('registerForSessionTime', () => {
    it('should register for a session time and include attendeeId in body', async () => {
      const fetchStub = sandbox.stub(window, 'fetch').resolves({
        json: () => ({ registrationStatus: 'registered' }),
        ok: true,
      });

      const result = await api.registerForSessionTime('time-1', 'me', { registrationStatus: 'registered' });
      expect(result.ok).to.be.true;
      expect(result.data).to.have.property('registrationStatus', 'registered');

      const [url, options] = fetchStub.firstCall.args;
      expect(url).to.include('/v1/session-times/time-1/attendees/me');
      const body = JSON.parse(options.body);
      expect(body).to.have.property('attendeeId', 'me');
      expect(body).to.have.property('registrationStatus', 'registered');
    });

    it('should return an error if registration fails', async () => {
      sandbox.stub(window, 'fetch').resolves({
        json: () => ({ message: 'Conflict' }),
        ok: false,
        status: 409,
      });

      const result = await api.registerForSessionTime('time-1', 'me', { registrationStatus: 'registered' });
      expect(result.ok).to.be.false;
      expect(result.status).to.equal(409);
    });

    it('should handle network errors', async () => {
      sandbox.stub(window, 'fetch').rejects(new Error('Network failure'));

      const result = await api.registerForSessionTime('time-1', 'me', { registrationStatus: 'registered' });
      expect(result.ok).to.be.false;
      expect(result.status).to.equal('Network Error');
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

  describe('validateRsvpToken', () => {
    it('should validate a usable RSVP token', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({ eventId: 'event-123', campaignId: 'camp-1' }), ok: true });
      const result = await api.validateRsvpToken('event-123', 'tok-1');
      expect(result.ok).to.be.true;
      expect(result.data).to.have.property('eventId', 'event-123');
    });

    it('should call the event-scoped rsvpTokenRegistrations endpoint with the token header', async () => {
      delete window.adobeIMS;
      const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({ eventId: 'event-123' }), ok: true });
      const result = await api.validateRsvpToken('event-123', 'tok-1');
      expect(result.ok).to.be.true;
      expect(fetchStub.calledOnce).to.be.true;
      const [url, options] = fetchStub.firstCall.args;
      expect(url).to.include('/v1/events/event-123/rsvpTokenRegistrations');
      expect(options.headers.get('x-adobe-esp-rsvp-token')).to.equal('tok-1');
    });

    it('should route the GET through ESP, not ESL', async () => {
      const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({ eventId: 'event-123' }), ok: true });
      await api.validateRsvpToken('event-123', 'tok-1');
      const [url] = fetchStub.firstCall.args;
      expect(url).to.include('service-platform');
      expect(url).to.not.include('service-layer');
    });

    it('should return an error for a used/expired/revoked/unknown token', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({ message: 'Gone' }), ok: false, status: 410 });
      const result = await api.validateRsvpToken('event-123', 'tok-1');
      expect(result.ok).to.be.false;
      expect(result.status).to.equal(410);
    });

    it('should handle network errors', async () => {
      sandbox.stub(window, 'fetch').rejects(new Error('Network failure'));
      const result = await api.validateRsvpToken('event-123', 'tok-1');
      expect(result.ok).to.be.false;
      expect(result.status).to.equal('Network Error');
    });

    it('should never attach the caller\'s own Authorization header, even when already signed in', async () => {
      window.adobeIMS = { getAccessToken: () => ({ token: 'assistants-own-token' }) };
      const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({ eventId: 'event-123' }), ok: true });
      await api.validateRsvpToken('event-123', 'tok-1');
      const [, options] = fetchStub.firstCall.args;
      expect(options.headers.has('Authorization')).to.be.false;
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

    it('should authenticate the create-attendee and add-to-event calls via the rsvp-token header when a guest registers with a token', async () => {
      BlockMediator.set('imsProfile', { account_type: 'guest', rsvpToken: 'tok-1' });
      const fetchStub = sandbox.stub(window, 'fetch');
      fetchStub.onCall(0).resolves({ json: () => ({ eventId, isFull: false }), ok: true });
      fetchStub.onCall(1).resolves({ json: () => (attendeeResp), ok: true });
      fetchStub.onCall(2).resolves({ json: () => ({ registrationStatus: 'registered' }), ok: true });

      await api.getAndCreateAndAddAttendee(eventId, attendeeData, 'tok-1');

      const createOptions = fetchStub.getCall(1).args[1];
      const addToEventOptions = fetchStub.getCall(2).args[1];
      expect(createOptions.headers.get('x-adobe-esp-rsvp-token')).to.equal('tok-1');
      expect(addToEventOptions.headers.get('x-adobe-esp-rsvp-token')).to.equal('tok-1');
    });

    it('should preserve the upstream status when create-attendee fails (e.g. an rsvp token that went stale between page load and submit)', async () => {
      BlockMediator.set('imsProfile', { account_type: 'guest', rsvpToken: 'tok-1' });
      const fetchStub = sandbox.stub(window, 'fetch');
      fetchStub.onCall(0).resolves({ json: () => ({ eventId, isFull: false }), ok: true });
      fetchStub.onCall(1).resolves({ json: () => ({ message: 'Gone' }), ok: false, status: 410 });

      const result = await api.getAndCreateAndAddAttendee(eventId, attendeeData, 'tok-1');
      expect(result.ok).to.be.false;
      expect(result.status).to.equal(410);
      expect(fetchStub.callCount).to.equal(2);
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

  describe('listEvents', () => {
    it('should fetch a page of events', async () => {
      sandbox.stub(window, 'fetch').resolves({
        json: () => ({ events: [{ eventId: '1' }], nextPageToken: 'tok-2' }),
        ok: true,
      });
      const result = await api.listEvents({});
      expect(result.ok).to.be.true;
      expect(result.data.events).to.deep.equal([{ eventId: '1' }]);
      expect(result.data.nextPageToken).to.equal('tok-2');
    });

    it('should call the ESP host, not ESL', async () => {
      const fetchStub = sandbox.stub(window, 'fetch').resolves({
        json: () => ({ events: [] }),
        ok: true,
      });
      await api.listEvents({});
      const [url] = fetchStub.firstCall.args;
      expect(url).to.include('/v1/events');
      expect(url).to.not.include('events-service-layer');
    });

    it('should return an error on a failed request', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({ message: 'nope' }), ok: false, status: 500 });
      const result = await api.listEvents({});
      expect(result.ok).to.be.false;
      expect(result.status).to.equal(500);
    });
  });

  describe('listAllEvents', () => {
    it('should walk every page until nextPageToken is exhausted', async () => {
      const fetchStub = sandbox.stub(window, 'fetch');
      fetchStub.onCall(0).resolves({
        json: () => ({ events: [{ eventId: '1' }], nextPageToken: 'tok-2' }),
        ok: true,
      });
      fetchStub.onCall(1).resolves({
        json: () => ({ events: [{ eventId: '2' }], nextPageToken: null }),
        ok: true,
      });
      const result = await api.listAllEvents({ fromDate: 1 });
      expect(result.ok).to.be.true;
      expect(result.data).to.deep.equal([{ eventId: '1' }, { eventId: '2' }]);
      expect(fetchStub.callCount).to.equal(2);
    });

    it('should cache the result for repeat calls with the same fromDate', async () => {
      const fetchStub = sandbox.stub(window, 'fetch').resolves({
        json: () => ({ events: [{ eventId: '1' }], nextPageToken: null }),
        ok: true,
      });
      await api.listAllEvents({ fromDate: 42 });
      await api.listAllEvents({ fromDate: 42 });
      expect(fetchStub.callCount).to.equal(1);
    });

    it('should not cache a failed fetch', async () => {
      const fetchStub = sandbox.stub(window, 'fetch');
      fetchStub.onCall(0).resolves({ json: () => ({ message: 'nope' }), ok: false, status: 500 });
      fetchStub.onCall(1).resolves({ json: () => ({ events: [], nextPageToken: null }), ok: true });
      const first = await api.listAllEvents({ fromDate: 99 });
      expect(first.ok).to.be.false;
      const second = await api.listAllEvents({ fromDate: 99 });
      expect(second.ok).to.be.true;
      expect(fetchStub.callCount).to.equal(2);
    });

    it('should apply no from-date floor when called with no arguments', async () => {
      const fetchStub = sandbox.stub(window, 'fetch').resolves({
        json: () => ({ events: [], nextPageToken: null }),
        ok: true,
      });
      await api.listAllEvents();
      const [url] = fetchStub.firstCall.args;
      expect(url).to.not.include('from-date');
    });
  });

  describe('getEspEvent', () => {
    it('should fetch a single event directly from ESP', async () => {
      const fetchStub = sandbox.stub(window, 'fetch').resolves({
        json: () => ({ eventId: 'event-1', enTitle: 'Test Event', published: true }),
        ok: true,
      });
      const result = await api.getEspEvent('event-1');
      expect(result.ok).to.be.true;
      expect(result.data).to.deep.equal({ eventId: 'event-1', enTitle: 'Test Event', published: true });
      const [url] = fetchStub.firstCall.args;
      expect(url).to.include('/v1/events/event-1');
      expect(url).to.not.include('events-service-layer');
    });

    it('should return an error for an unknown event id', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({ message: 'not found' }), ok: false, status: 404 });
      const result = await api.getEspEvent('missing-id');
      expect(result.ok).to.be.false;
      expect(result.status).to.equal(404);
    });

    it('should not send an Authorization header even with an override token set', async () => {
      api.setEspAuthToken('da-token');
      try {
        const fetchStub = sandbox.stub(window, 'fetch').resolves({
          json: () => ({ eventId: 'event-1' }),
          ok: true,
        });
        await api.getEspEvent('event-1');
        const [, options] = fetchStub.firstCall.args;
        expect(options.headers.has('Authorization')).to.be.false;
      } finally {
        api.setEspAuthToken(null);
      }
    });
  });

  describe('getEventSessionCatalog', () => {
    it('should fetch the raw session catalog for an event, including sessionTimes', async () => {
      sandbox.stub(window, 'fetch').resolves({
        json: () => ({
          sessions: [{ sessionId: 's-1' }],
          sessionTimes: [{ sessionId: 's-1', sessionTimeId: 't-1', startTimeMillis: 1700000000000 }],
        }),
        ok: true,
      });
      const result = await api.getEventSessionCatalog('event-1');
      expect(result.ok).to.be.true;
      expect(result.data.sessions).to.deep.equal([{ sessionId: 's-1' }]);
      expect(result.data.sessionTimes).to.deep.equal([{ sessionId: 's-1', sessionTimeId: 't-1', startTimeMillis: 1700000000000 }]);
    });

    it('should default sessions and sessionTimes to empty arrays when absent', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });
      const result = await api.getEventSessionCatalog('event-1');
      expect(result.ok).to.be.true;
      expect(result.data).to.deep.equal({ sessions: [], sessionTimes: [] });
    });

    it('should return an error on a failed request', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({ message: 'nope' }), ok: false, status: 404 });
      const result = await api.getEventSessionCatalog('event-1');
      expect(result.ok).to.be.false;
      expect(result.status).to.equal(404);
    });

    it('should not send an Authorization header even with an override token set', async () => {
      api.setEspAuthToken('da-token');
      try {
        const fetchStub = sandbox.stub(window, 'fetch').resolves({
          json: () => ({ sessions: [] }),
          ok: true,
        });
        await api.getEventSessionCatalog('event-1');
        const [, options] = fetchStub.firstCall.args;
        expect(options.headers.has('Authorization')).to.be.false;
      } finally {
        api.setEspAuthToken(null);
      }
    });
  });
});
