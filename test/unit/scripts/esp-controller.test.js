import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import BlockMediator from '../../../event-libs/v1/deps/block-mediator.min.js';
import { waitForAdobeIMS, resetAdobeIMSWatcher, setEventServiceEnvOverride } from '../../../event-libs/v1/utils/utils.js';

describe('Adobe Event Service API', () => {
  let api;
  let sandbox;

  before(async () => {
    api = await import('../../../event-libs/v1/utils/esp-controller.js');
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    resetAdobeIMSWatcher();
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
      await waitForAdobeIMS();
      expect(window.adobeIMS.getAccessToken()).to.have.property('token', 'fake-token');
    });

    it('should resolve once adobeIMS is assigned after the fact', async () => {
      delete window.adobeIMS;

      const waitPromise = waitForAdobeIMS();
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      window.adobeIMS = { getAccessToken: () => ({ token: 'later-token' }) };

      await waitPromise;
      expect(window.adobeIMS.getAccessToken()).to.have.property('token', 'later-token');
    });

    it('should give up and resolve after the timeout when adobeIMS never appears', async () => {
      delete window.adobeIMS;
      const clock = sandbox.useFakeTimers();

      const waitPromise = waitForAdobeIMS();
      await clock.tickAsync(10000);
      await waitPromise;

      expect(window.adobeIMS).to.be.undefined;
    });

    it('should not treat a getAccessToken-less object as ready', async () => {
      delete window.adobeIMS;
      const clock = sandbox.useFakeTimers();

      const waitPromise = waitForAdobeIMS();
      window.adobeIMS = { getProfile: () => Promise.resolve({}) };
      await clock.tickAsync(1000);

      let settledEarly = false;
      waitPromise.then(() => { settledEarly = true; });
      await Promise.resolve();
      expect(settledEarly).to.be.false;

      await clock.tickAsync(9000);
      await waitPromise;
    });

    it('should notify every concurrent caller from a single adobeIMS assignment', async () => {
      delete window.adobeIMS;

      const first = waitForAdobeIMS();
      const second = waitForAdobeIMS();
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      window.adobeIMS = { getAccessToken: () => ({ token: 'shared-token' }) };

      await Promise.all([first, second]);
      expect(window.adobeIMS.getAccessToken()).to.have.property('token', 'shared-token');
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

    it('should report a network error to lana with the full error detail interpolated', async () => {
      sandbox.stub(window, 'fetch').rejects(new Error('offline'));
      const lanaLogStub = sandbox.stub(window.lana, 'log');
      const result = await api.getEvent('123');
      expect(result.status).to.equal('Network Error');
      expect(lanaLogStub.calledOnce).to.equal(true);
      const [message] = lanaLogStub.firstCall.args;
      expect(message).to.include('[esp-controller,get-event] Failed to get details for event 123: Error: offline');
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

    it('should report the failure to lana with the eventId', async () => {
      sandbox.stub(window, 'fetch').resolves({ text: () => 'Attendee not found', ok: false });
      const lanaLogStub = sandbox.stub(window.lana, 'log');
      await api.getAttendee('event-123');
      expect(lanaLogStub.calledOnce).to.equal(true);
      expect(lanaLogStub.firstCall.args[0]).to.include('event-123');
    });

    it('should log a 404 (no attendee yet) as info, not error, since it is expected control flow', async () => {
      sandbox.stub(window, 'fetch').resolves({ text: () => 'Not found', ok: false, status: 404 });
      const lanaLogStub = sandbox.stub(window.lana, 'log');
      await api.getAttendee('event-123');
      expect(lanaLogStub.calledOnce).to.equal(true);
      expect(lanaLogStub.firstCall.args[1].severity).to.equal('info');
      expect(lanaLogStub.firstCall.args[1]).to.not.have.property('sampleRate');
    });

    it('should still log a non-404 failure as error', async () => {
      sandbox.stub(window, 'fetch').resolves({ text: () => 'Server error', ok: false, status: 500 });
      const lanaLogStub = sandbox.stub(window.lana, 'log');
      await api.getAttendee('event-123');
      expect(lanaLogStub.firstCall.args[1].severity).to.equal('error');
      expect(lanaLogStub.firstCall.args[1].sampleRate).to.equal(10);
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

    it('should log a 404 (no attendee yet) as info, not error, since it is expected control flow', async () => {
      sandbox.stub(window, 'fetch').resolves({ text: () => 'Not found', ok: false, status: 404 });
      const lanaLogStub = sandbox.stub(window.lana, 'log');
      await api.getEventAttendee('event-123');
      expect(lanaLogStub.calledOnce).to.equal(true);
      expect(lanaLogStub.firstCall.args[1].severity).to.equal('info');
      expect(lanaLogStub.firstCall.args[1]).to.not.have.property('sampleRate');
    });

    it('should still log a non-404 failure as error', async () => {
      sandbox.stub(window, 'fetch').resolves({ text: () => 'Server error', ok: false, status: 500 });
      const lanaLogStub = sandbox.stub(window.lana, 'log');
      await api.getEventAttendee('event-123');
      expect(lanaLogStub.firstCall.args[1].severity).to.equal('error');
      expect(lanaLogStub.firstCall.args[1].sampleRate).to.equal(10);
    });
  });

  describe('submitRsvp', () => {
    const payload = { firstName: 'John', lastName: 'Doe', email: 'john@test.com', jobTitle: 'Engineer', customQ: 'yes' };

    it('makes exactly one POST to the event attendee endpoint with the complete flat payload', async () => {
      const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({ registrationStatus: 'registered' }), ok: true, status: 201 });

      const result = await api.submitRsvp('event-123', payload);

      expect(fetchStub.callCount).to.equal(1);
      const [url, options] = fetchStub.firstCall.args;
      expect(url).to.match(/\/v1\/events\/event-123\/attendees\/me$/);
      expect(url).to.not.match(/\/v1\/attendees(\/|$)/);
      expect(options.method).to.equal('POST');
      expect(JSON.parse(options.body)).to.deep.equal(payload);
      expect(result.ok).to.be.true;
      expect(result.status).to.equal(201);
      expect(result.data.registrationStatus).to.equal('registered');
    });

    it('uses payload.attendeeId as the path identifier when present', async () => {
      const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true, status: 200 });

      await api.submitRsvp('event-123', { ...payload, attendeeId: 'att-1' });

      expect(fetchStub.firstCall.args[0]).to.match(/\/v1\/events\/event-123\/attendees\/att-1$/);
    });

    it('returns false without making a request when eventId or payload is missing', async () => {
      const fetchStub = sandbox.stub(window, 'fetch');
      expect(await api.submitRsvp('event-123', null)).to.be.false;
      expect(await api.submitRsvp('', payload)).to.be.false;
      expect(fetchStub.called).to.be.false;
    });

    it('treats a followed 303 (signed-in duplicate) as the existing resource', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({ attendeeId: 'att-1', registrationStatus: 'registered' }), ok: true, status: 200, redirected: true });

      const result = await api.submitRsvp('event-123', payload);

      expect(result.ok).to.be.true;
      expect(result.data.attendeeId).to.equal('att-1');
    });

    it('parses a structured RsvpValidationError with code and fieldErrors', async () => {
      const body = {
        code: 'RsvpValidationError',
        message: 'Validation failed',
        fieldErrors: [
          { field: 'companyName', code: 'FieldRequired', message: 'required' },
          { field: 'industry', code: 'FieldInvalidOption', message: 'bad option' },
        ],
      };
      sandbox.stub(window, 'fetch').resolves({ text: () => JSON.stringify(body), ok: false, status: 400 });

      const result = await api.submitRsvp('event-123', payload);

      expect(result.ok).to.be.false;
      expect(result.status).to.equal(400);
      expect(result.code).to.equal('RsvpValidationError');
      expect(result.fieldErrors).to.deep.equal(body.fieldErrors);
      expect(result.error).to.deep.equal(body);
    });

    it('parses non-field JSON error codes (duplicate, event full)', async () => {
      const fetchStub = sandbox.stub(window, 'fetch');
      fetchStub.onCall(0).resolves({ text: () => JSON.stringify({ code: 'AttendeeAlreadyRegistered', message: 'dup' }), ok: false, status: 409 });
      fetchStub.onCall(1).resolves({ text: () => JSON.stringify({ code: 'EventFull', message: 'full' }), ok: false, status: 400 });

      const dup = await api.submitRsvp('event-123', payload);
      const full = await api.submitRsvp('event-123', payload);

      expect(dup).to.include({ ok: false, status: 409, code: 'AttendeeAlreadyRegistered' });
      expect(dup.fieldErrors).to.deep.equal([]);
      expect(full).to.include({ ok: false, status: 400, code: 'EventFull' });
    });

    it('falls back safely for plain-text error bodies', async () => {
      sandbox.stub(window, 'fetch').resolves({ text: () => 'Event is full', ok: false, status: 400 });

      const result = await api.submitRsvp('event-123', payload);

      expect(result.ok).to.be.false;
      expect(result.status).to.equal(400);
      expect(result.error).to.equal('Event is full');
      expect(result.code).to.be.undefined;
      expect(result.fieldErrors).to.deep.equal([]);
    });

    it('drops fieldErrors entries whose field is not a safe field name', async () => {
      const body = {
        code: 'RsvpValidationError',
        fieldErrors: [{ field: 'ok_field', code: 'FieldRequired' }, { field: 'bad field <script>', code: 'FieldUnsafe' }, { code: 'FieldRequired' }],
      };
      sandbox.stub(window, 'fetch').resolves({ text: () => JSON.stringify(body), ok: false, status: 400 });

      const result = await api.submitRsvp('event-123', payload);

      expect(result.fieldErrors.map((fe) => fe.field)).to.deep.equal(['ok_field']);
    });

    it('returns a Network Error result when fetch rejects', async () => {
      sandbox.stub(window, 'fetch').rejects(new Error('offline'));

      const result = await api.submitRsvp('event-123', payload);

      expect(result).to.deep.equal({ ok: false, status: 'Network Error', error: 'offline' });
    });

    it('logs endpoint, status, code and field names only — never submitted values', async () => {
      const secret = 'secret-value-123@example.com';
      const body = { code: 'RsvpValidationError', fieldErrors: [{ field: 'email', code: 'FieldInvalidFormat', message: 'bad' }] };
      sandbox.stub(window, 'fetch').resolves({ text: () => JSON.stringify(body), ok: false, status: 400 });
      const lanaLogStub = sandbox.stub(window.lana, 'log');

      await api.submitRsvp('event-123', { ...payload, email: secret });

      expect(lanaLogStub.calledOnce).to.be.true;
      const message = lanaLogStub.firstCall.args[0];
      expect(message).to.include('/v1/events/{eventId}/attendees/{attendeeId}');
      expect(message).to.include('code=RsvpValidationError');
      expect(message).to.include('fields=email');
      expect(message).to.not.include(secret);
      expect(message).to.not.include('John');
      expect(lanaLogStub.firstCall.args[1].severity).to.equal('warning');
    });

    it('reports non-validation failures as critical with the status and code', async () => {
      sandbox.stub(window, 'fetch').resolves({ text: () => JSON.stringify({ code: 'EventFull', message: 'full' }), ok: false, status: 400 });
      const lanaLogStub = sandbox.stub(window.lana, 'log');

      await api.submitRsvp('event-123', payload);

      expect(lanaLogStub.firstCall.args[0]).to.include('code=EventFull');
      expect(lanaLogStub.firstCall.args[1].severity).to.equal('critical');
      expect(lanaLogStub.firstCall.args[1].sampleRate).to.equal(100);
    });

    it('sends both the guest IMS token and the rsvp-token header when a token is passed', async () => {
      window.adobeIMS = { getAccessToken: () => ({ token: 'fake-token', isGuestToken: true }) };
      const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });

      await api.submitRsvp('123', payload, 'tok-1');

      const options = fetchStub.firstCall.args[1];
      expect(options.headers.get('x-adobe-esp-rsvp-token')).to.equal('tok-1');
      expect(options.headers.get('Authorization')).to.equal('Bearer fake-token');
    });

    it('still forwards a real signed-in session\'s IMS token alongside the rsvp-token header — Cluster Gateway requires one either way', async () => {
      window.adobeIMS = { getAccessToken: () => ({ token: 'assistants-own-token', isGuestToken: false }) };
      const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });

      await api.submitRsvp('123', payload, 'tok-1');

      const options = fetchStub.firstCall.args[1];
      expect(options.headers.get('x-adobe-esp-rsvp-token')).to.equal('tok-1');
      expect(options.headers.get('Authorization')).to.equal('Bearer assistants-own-token');
    });

    it('omits the rsvp-token header when no token is passed, and still authenticates via IMS', async () => {
      window.adobeIMS = { getAccessToken: () => ({ token: 'fake-token' }) };
      const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });

      await api.submitRsvp('123', payload);

      const options = fetchStub.firstCall.args[1];
      expect(options.headers.get('Authorization')).to.equal('Bearer fake-token');
      expect(options.headers.has('x-adobe-esp-rsvp-token')).to.be.false;
    });

    it('degrades gracefully (no throw, no Authorization) when a token is passed with no IMS session', async () => {
      delete window.adobeIMS;
      const clock = sandbox.useFakeTimers();
      const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });

      try {
        const attendeePromise = api.submitRsvp('123', payload, 'tok-1');
        await clock.tickAsync(10000);
        await attendeePromise;

        const options = fetchStub.firstCall.args[1];
        expect(options.headers.get('x-adobe-esp-rsvp-token')).to.equal('tok-1');
        expect(options.headers.has('Authorization')).to.be.false;
      } finally {
        window.adobeIMS = {
          getAccessToken: () => ({ token: 'fake-token' }),
          getProfile: () => Promise.resolve({ name: 'Test User' }),
          signIn: () => {},
        };
      }
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

    it('should report the failure to lana with the eventId and attendeeId', async () => {
      sandbox.stub(window, 'fetch').onFirstCall().resolves({ text: () => 'Gone', ok: false });
      const lanaLogStub = sandbox.stub(window.lana, 'log');
      await api.deleteAttendeeFromEvent('event-123', 'att-1');
      expect(lanaLogStub.calledOnce).to.equal(true);
      expect(lanaLogStub.firstCall.args[0]).to.include('event-123');
      expect(lanaLogStub.firstCall.args[0]).to.include('att-1');
      expect(lanaLogStub.firstCall.args[1].severity).to.equal('critical');
      expect(lanaLogStub.firstCall.args[1].sampleRate).to.equal(100);
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

    it('should report a registration failure to lana as critical, part of the RSVP flow', async () => {
      sandbox.stub(window, 'fetch').resolves({
        json: () => ({ message: 'Conflict' }),
        ok: false,
        status: 409,
      });
      const lanaLogStub = sandbox.stub(window.lana, 'log');

      await api.registerForSessionTime('time-1', 'me', { registrationStatus: 'registered' });
      expect(lanaLogStub.calledOnce).to.equal(true);
      expect(lanaLogStub.firstCall.args[1].severity).to.equal('critical');
      expect(lanaLogStub.firstCall.args[1].sampleRate).to.equal(100);
    });

    it('should handle network errors', async () => {
      sandbox.stub(window, 'fetch').rejects(new Error('Network failure'));

      const result = await api.registerForSessionTime('time-1', 'me', { registrationStatus: 'registered' });
      expect(result.ok).to.be.false;
      expect(result.status).to.equal('Network Error');
    });
  });

  describe('unregisterFromSessionTime', () => {
    it('should unregister from a session time', async () => {
      sandbox.stub(window, 'fetch').resolves({ status: 204, ok: true });

      const result = await api.unregisterFromSessionTime('time-1');
      expect(result.ok).to.be.true;
    });

    it('should return an error if unregistration fails', async () => {
      sandbox.stub(window, 'fetch').resolves({ ok: false, status: 409 });

      const result = await api.unregisterFromSessionTime('time-1');
      expect(result.ok).to.be.false;
      expect(result.status).to.equal(409);
    });

    it('should report an unregistration failure to lana as critical, part of the RSVP flow', async () => {
      sandbox.stub(window, 'fetch').resolves({ ok: false, status: 409 });
      const lanaLogStub = sandbox.stub(window.lana, 'log');

      await api.unregisterFromSessionTime('time-1');
      expect(lanaLogStub.calledOnce).to.equal(true);
      expect(lanaLogStub.firstCall.args[1].severity).to.equal('critical');
      expect(lanaLogStub.firstCall.args[1].sampleRate).to.equal(100);
    });

    it('should handle network errors', async () => {
      sandbox.stub(window, 'fetch').rejects(new Error('Network failure'));

      const result = await api.unregisterFromSessionTime('time-1');
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

    it('should report the failure to lana with the eventId, never the token', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({ message: 'Gone' }), ok: false, status: 410 });
      const lanaLogStub = sandbox.stub(window.lana, 'log');
      await api.validateRsvpToken('event-123', 'tok-1');
      expect(lanaLogStub.calledOnce).to.equal(true);
      expect(lanaLogStub.firstCall.args[0]).to.include('event-123');
      expect(lanaLogStub.firstCall.args[0]).to.not.include('tok-1');
    });

    it('should log a used/expired/revoked/unknown token (401/404/409/410) as info, since it is expected control flow', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({ message: 'Gone' }), ok: false, status: 410 });
      const lanaLogStub = sandbox.stub(window.lana, 'log');
      await api.validateRsvpToken('event-123', 'tok-1');
      expect(lanaLogStub.firstCall.args[1].severity).to.equal('info');
      expect(lanaLogStub.firstCall.args[1]).to.not.have.property('sampleRate');
    });

    it('should log a genuine validation failure (e.g. a 500) as critical, part of the RSVP flow', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({ message: 'Server error' }), ok: false, status: 500 });
      const lanaLogStub = sandbox.stub(window.lana, 'log');
      await api.validateRsvpToken('event-123', 'tok-1');
      expect(lanaLogStub.firstCall.args[1].severity).to.equal('critical');
      expect(lanaLogStub.firstCall.args[1].sampleRate).to.equal(100);
    });

    it('should log a network error as critical, part of the RSVP flow', async () => {
      sandbox.stub(window, 'fetch').rejects(new Error('Network failure'));
      const lanaLogStub = sandbox.stub(window.lana, 'log');
      await api.validateRsvpToken('event-123', 'tok-1');
      expect(lanaLogStub.firstCall.args[1].severity).to.equal('critical');
      expect(lanaLogStub.firstCall.args[1].sampleRate).to.equal(100);
    });

    it('should never attach the caller\'s own Authorization header, even when already signed in', async () => {
      window.adobeIMS = { getAccessToken: () => ({ token: 'assistants-own-token' }) };
      const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({ eventId: 'event-123' }), ok: true });
      await api.validateRsvpToken('event-123', 'tok-1');
      const [, options] = fetchStub.firstCall.args;
      expect(options.headers.has('Authorization')).to.be.false;
    });
  });

  describe('registerForEvent', () => {
    const eventId = 'event-123';
    const attendeeData = { firstName: 'John', lastName: 'Doe', email: 'john@test.com' };
    const writeCalls = (stub) => stub.getCalls().filter((c) => c.args[1]?.method === 'POST');
    const stubFlow = ({ event = { eventId, isFull: false }, campaign, submit = { registrationStatus: 'registered' } } = {}) => {
      const fetchStub = sandbox.stub(window, 'fetch').callsFake((url) => {
        if (url.includes('/campaigns/')) {
          return Promise.resolve(campaign || { json: () => ({ message: 'Not found' }), ok: false, status: 404 });
        }
        if (url.includes('/attendees')) return Promise.resolve({ json: () => submit, ok: true, status: 201 });
        return Promise.resolve({ json: () => event, ok: true });
      });
      return fetchStub;
    };

    beforeEach(() => {
      BlockMediator.set('imsProfile', { account_type: 'type1' });
    });

    it('registers an authenticated user with exactly one write request', async () => {
      const fetchStub = stubFlow();

      const result = await api.registerForEvent(eventId, attendeeData);

      expect(result.ok).to.be.true;
      expect(result.data.registrationStatus).to.equal('registered');
      const writes = writeCalls(fetchStub);
      expect(writes).to.have.length(1);
      expect(writes[0].args[0]).to.match(/\/v1\/events\/event-123\/attendees\/me$/);
      expect(fetchStub.getCalls().some((c) => /\/v1\/attendees/.test(c.args[0]))).to.be.false;
      expect(JSON.parse(writes[0].args[1].body)).to.deep.equal({ ...attendeeData, registrationStatus: 'registered' });
    });

    it('does not look up or write the base profile for a guest', async () => {
      BlockMediator.set('imsProfile', { account_type: 'guest' });
      const fetchStub = stubFlow();

      const result = await api.registerForEvent(eventId, attendeeData);

      expect(result.ok).to.be.true;
      expect(writeCalls(fetchStub)).to.have.length(1);
      expect(fetchStub.getCalls().some((c) => /\/v1\/attendees(\/|$)/.test(c.args[0]))).to.be.false;
    });

    it('sends base, event and custom fields together in one flat payload without routing by field name', async () => {
      const fetchStub = stubFlow();

      await api.registerForEvent(eventId, {
        ...attendeeData,
        jobTitle: 'Engineer',
        requiresTicket: ['Yes'],
        customEventQuestion: 'Yes, I will attend the workshop',
        empty: '',
      });

      const body = JSON.parse(writeCalls(fetchStub)[0].args[1].body);
      expect(body).to.deep.equal({
        ...attendeeData,
        jobTitle: 'Engineer',
        requiresTicket: true,
        customEventQuestion: 'Yes, I will attend the workshop',
        registrationStatus: 'registered',
      });
    });

    it('drops prototype-chain keys from the payload', async () => {
      const fetchStub = stubFlow();

      await api.registerForEvent(eventId, JSON.parse('{"__proto__":{"polluted":true},"constructor":"x","firstName":"John"}'));

      const body = JSON.parse(writeCalls(fetchStub)[0].args[1].body);
      expect(Object.keys(body).sort()).to.deep.equal(['firstName', 'registrationStatus']);
    });

    it('sends the rsvp-token header on the single request when a guest registers with a token', async () => {
      BlockMediator.set('imsProfile', { account_type: 'guest', rsvpToken: 'tok-1' });
      const fetchStub = stubFlow();

      await api.registerForEvent(eventId, attendeeData, 'tok-1');

      const writes = writeCalls(fetchStub);
      expect(writes).to.have.length(1);
      expect(writes[0].args[1].headers.get('x-adobe-esp-rsvp-token')).to.equal('tok-1');
    });

    it('preserves the upstream status and code when the single request fails (e.g. a stale rsvp token)', async () => {
      BlockMediator.set('imsProfile', { account_type: 'guest', rsvpToken: 'tok-1' });
      const fetchStub = sandbox.stub(window, 'fetch').callsFake((url) => {
        if (url.includes('/attendees')) {
          return Promise.resolve({ text: () => JSON.stringify({ code: 'InvalidAttendeeToken', message: 'Gone' }), ok: false, status: 410 });
        }
        return Promise.resolve({ json: () => ({ eventId, isFull: false }), ok: true });
      });

      const result = await api.registerForEvent(eventId, attendeeData, 'tok-1');

      expect(result.ok).to.be.false;
      expect(result.status).to.equal(410);
      expect(result.code).to.equal('InvalidAttendeeToken');
      expect(writeCalls(fetchStub)).to.have.length(1);
    });

    it('returns a failure without any write when the event lookup fails', async () => {
      const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: false, status: 404 });

      const result = await api.registerForEvent(eventId, attendeeData);

      expect(result.ok).to.be.false;
      expect(writeCalls(fetchStub)).to.have.length(0);
    });

    it('waitlists when event is full regardless of campaign', async () => {
      BlockMediator.set('imsProfile', { account_type: 'guest' });
      const fetchStub = stubFlow({ event: { eventId, isFull: true }, submit: { registrationStatus: 'waitlisted' } });

      const result = await api.registerForEvent(eventId, { ...attendeeData, campaignId: 'camp-1' });

      expect(result.ok).to.be.true;
      expect(JSON.parse(writeCalls(fetchStub)[0].args[1].body)).to.include({ registrationStatus: 'waitlisted', campaignId: 'camp-1' });
      expect(fetchStub.getCalls().some((c) => c.args[0].includes('/campaigns/'))).to.be.false;
    });

    [
      ['has no attendeeLimit', { campaignId: 'camp-1', attendeeCount: 50, waitlistAttendeeCount: 0 }, 'registered'],
      ['has capacity and no waitlist', { campaignId: 'camp-1', attendeeLimit: 100, attendeeCount: 50, waitlistAttendeeCount: 0 }, 'registered'],
      ['attendeeLimit equals attendeeCount', { campaignId: 'camp-1', attendeeLimit: 100, attendeeCount: 100, waitlistAttendeeCount: 0 }, 'waitlisted'],
      ['has capacity but a waitlist backlog', { campaignId: 'camp-1', attendeeLimit: 100, attendeeCount: 80, waitlistAttendeeCount: 5 }, 'waitlisted'],
    ].forEach(([title, campaignData, expected]) => {
      it(`sends registrationStatus ${expected} when the campaign ${title}`, async () => {
        const fetchStub = stubFlow({ campaign: { json: () => campaignData, ok: true }, submit: { registrationStatus: expected } });

        const result = await api.registerForEvent(eventId, { ...attendeeData, campaignId: 'camp-1' });

        expect(result.ok).to.be.true;
        const writes = writeCalls(fetchStub);
        expect(writes).to.have.length(1);
        expect(JSON.parse(writes[0].args[1].body)).to.include({ registrationStatus: expected, campaignId: 'camp-1' });
      });
    });

    it('falls back to event-level status when campaign lookup fails', async () => {
      const fetchStub = stubFlow();

      const result = await api.registerForEvent(eventId, { ...attendeeData, campaignId: 'camp-1' });

      expect(result.ok).to.be.true;
      expect(JSON.parse(writeCalls(fetchStub)[0].args[1].body).registrationStatus).to.equal('registered');
    });

    it('surfaces a structured validation failure without a second request', async () => {
      const body = { code: 'RsvpValidationError', message: 'x', fieldErrors: [{ field: 'companyName', code: 'FieldRequired', message: 'required' }] };
      const fetchStub = sandbox.stub(window, 'fetch').callsFake((url) => {
        if (url.includes('/attendees')) return Promise.resolve({ text: () => JSON.stringify(body), ok: false, status: 400 });
        return Promise.resolve({ json: () => ({ eventId, isFull: false }), ok: true });
      });

      const result = await api.registerForEvent(eventId, attendeeData);

      expect(result.ok).to.be.false;
      expect(result.code).to.equal('RsvpValidationError');
      expect(result.fieldErrors).to.have.length(1);
      expect(writeCalls(fetchStub)).to.have.length(1);
    });

    it('catches an unexpected error and reports it to lana with the eventId', async () => {
      sandbox.stub(window, 'fetch').resolves({ json: () => ({ eventId, isFull: false }), ok: true });
      const lanaLogStub = sandbox.stub(window.lana, 'log');

      const result = await api.registerForEvent(eventId, null);

      expect(result.ok).to.be.false;
      expect(result.status).to.equal('Unexpected Error');
      expect(lanaLogStub.calledOnce).to.equal(true);
      expect(lanaLogStub.firstCall.args[0]).to.include(eventId);
      expect(lanaLogStub.firstCall.args[1].severity).to.equal('critical');
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

    describe('CDN routing (MWPW-206486)', () => {
      afterEach(() => setEventServiceEnvOverride(null));

      it('fetches from the prod CDN domain on prod', async () => {
        setEventServiceEnvOverride('prod');
        const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });
        await api.getEventSessionCatalog('event-1');
        const [url] = fetchStub.firstCall.args;
        expect(url).to.equal('https://events-platform-prod-cdn.aws122.adobeitc.com/v1/events/event-1/session-catalog');
      });

      it('fetches from the stage CDN domain on stage', async () => {
        setEventServiceEnvOverride('stage');
        const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });
        await api.getEventSessionCatalog('event-1');
        const [url] = fetchStub.firstCall.args;
        expect(url).to.equal('https://events-platform-stage-cdn.aws125.adobeitc.com/v1/events/event-1/session-catalog');
      });

      it('fetches from the dev CDN domain on dev', async () => {
        setEventServiceEnvOverride('dev');
        const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });
        await api.getEventSessionCatalog('event-1');
        const [url] = fetchStub.firstCall.args;
        expect(url).to.equal('https://events-platform-dev-cdn.aws125.adobeitc.com/v1/events/event-1/session-catalog');
      });

      it('falls back to the origin ESP host on local, which has no CDN', async () => {
        setEventServiceEnvOverride('local');
        const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });
        await api.getEventSessionCatalog('event-1');
        const [url] = fetchStub.firstCall.args;
        expect(url).to.include('wcms-events-service-platform-deploy-ethos102-stage-caff5f.stage.cloud.adobe.io');
      });

      // local/dev02/stage02 have no CDN — fall back to origin ESP.
      it('falls back to the origin ESP host on dev02, which has no CDN', async () => {
        setEventServiceEnvOverride('dev02');
        const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });
        await api.getEventSessionCatalog('event-1');
        const [url] = fetchStub.firstCall.args;
        expect(url).to.include('wcms-events-service-platform-deploy-ethos102-stage-c81eb6.stage.cloud.adobe.io');
      });

      it('falls back to the origin ESP host on stage02, which has no CDN', async () => {
        setEventServiceEnvOverride('stage02');
        const fetchStub = sandbox.stub(window, 'fetch').resolves({ json: () => ({}), ok: true });
        await api.getEventSessionCatalog('event-1');
        const [url] = fetchStub.firstCall.args;
        expect(url).to.include('wcms-events-service-platform-deploy-ethos105-stage-9a5fdc.stage.cloud.adobe.io');
      });
    });
  });
});
