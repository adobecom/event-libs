import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

import {
  logDebug, logInfo, logWarning, logError, logCritical,
  logRegistrationFailure, logRegistrationError,
} from '../../../event-libs/v1/utils/lana-log.js';

describe('lana-log', () => {
  let calls;
  let originalLog;
  let sandbox;

  beforeEach(() => {
    calls = [];
    sandbox = sinon.createSandbox();
    originalLog = window.lana?.log;
    window.lana = { log: (msg, options) => calls.push({ msg, options }) };
  });

  afterEach(() => {
    window.lana.log = originalLog;
    sandbox.restore();
  });

  it('keeps scope in the message and uses severity instead of scope tags for alerting', () => {
    logError('my-scope', 'thing failed');
    expect(calls[0].msg).to.include('[my-scope] thing failed');
    expect(calls[0].options).to.deep.equal({ severity: 'error', sampleRate: 10 });
  });

  it('omits the trailing data suffix when no data is passed', () => {
    logError('scope', 'msg');
    expect(calls[0].msg).to.equal('[scope] msg');
  });

  it('maps each helper to its matching severity', () => {
    logDebug('scope', 'a');
    logInfo('scope', 'b');
    logWarning('scope', 'c');
    logError('scope', 'd');
    logCritical('scope', 'e');
    expect(calls.map((c) => c.options.severity)).to.deep.equal([
      'debug', 'info', 'warning', 'error', 'critical',
    ]);
    calls.forEach((call) => {
      expect(call.options).to.not.have.property('tags');
      expect(call.options).to.not.have.property('l_severity');
    });
  });

  it('serializes an Error without producing "{}"', () => {
    logError('scope', 'msg', new Error('boom'));
    expect(calls[0].msg).to.include('[scope] msg: Error: boom');
    expect(calls[0].msg).to.not.include('{}');
  });

  it('serializes a subclassed error using its own name, not a hardcoded "Error"', () => {
    logError('scope', 'msg', new TypeError('bad'));
    expect(calls[0].msg).to.include('[scope] msg: TypeError: bad');
  });

  it('serializes a fetch Response without producing "{}"', () => {
    const response = new Response(null, { status: 404, statusText: 'Not Found' });
    logError('scope', 'msg', response);
    expect(calls[0].msg).to.include('status=404');
    expect(calls[0].msg).to.include('ok=false');
    expect(calls[0].msg).to.not.include('{}');
  });

  it('serializes a plain object via JSON.stringify', () => {
    logError('scope', 'msg', { foo: 'bar' });
    expect(calls[0].msg).to.include('[scope] msg: {"foo":"bar"}');
  });

  it('redacts PII-shaped keys on a plain object', () => {
    logError('scope', 'msg', { email: 'a@b.com', firstName: 'Jane', status: 'active' });
    expect(calls[0].msg).to.include(
      '[scope] msg: {"email":"[REDACTED]","firstName":"[REDACTED]","status":"active"}',
    );
  });

  it('redacts PII-shaped keys inside nested objects', () => {
    logError('scope', 'msg', { code: 'Conflict', attendee: { email: 'a@b.com', phone: '555-1234' } });
    expect(calls[0].msg).to.include(
      '[scope] msg: {"code":"Conflict","attendee":{"email":"[REDACTED]","phone":"[REDACTED]"}}',
    );
  });

  it('passes a thrown string through as-is rather than double-encoding it', () => {
    logError('scope', 'msg', 'oops');
    expect(calls[0].msg).to.include('[scope] msg: oops');
  });

  it('falls back to String(data) for a circular object instead of throwing', () => {
    const circular = {};
    circular.self = circular;
    expect(() => logError('scope', 'msg', circular)).to.not.throw();
    expect(calls[0].msg).to.include('[object Object]');
  });

  it('does not split messages by browser, language, or viewport at any severity', () => {
    const userAgent = sandbox.stub(navigator, 'userAgent');
    const language = sandbox.stub(navigator, 'language');
    const width = sandbox.stub(window, 'innerWidth');
    const height = sandbox.stub(window, 'innerHeight');
    [logDebug, logInfo, logWarning, logError, logCritical].forEach((log) => {
      userAgent.get(() => 'Browser A');
      language.get(() => 'en-US');
      width.get(() => 1200);
      height.get(() => 800);
      log('scope', 'msg');
      userAgent.get(() => 'Browser B');
      language.get(() => 'ja-JP');
      width.get(() => 400);
      height.get(() => 600);
      log('scope', 'msg');
    });
    expect(new Set(calls.map(({ msg }) => msg))).to.deep.equal(new Set(['[scope] msg']));
  });

  it('excludes raw body text embedded in a SyntaxError', () => {
    logError('scope', 'Unreadable response', new SyntaxError('PRIVATE BODY'));
    expect(calls[0].msg).to.equal('[scope] Unreadable response: SyntaxError');
  });

  it('keeps Gary\'s poller example in one message bucket across browsers', () => {
    const userAgent = sandbox.stub(navigator, 'userAgent');
    const width = sandbox.stub(window, 'innerWidth');
    ['Desktop Browser', 'Mobile Browser'].forEach((browser, i) => {
      userAgent.get(() => browser);
      width.get(() => 400 + i * 800);
      logError('poller', 'poll failed', new Error('Mobile Rider media-status fetch failed: 404'));
    });
    calls.forEach((call) => expect(call).to.deep.equal({
      msg: '[poller] poll failed: Error: Mobile Rider media-status fetch failed: 404',
      options: { severity: 'error', sampleRate: 10 },
    }));
  });

  it('aggregates 1500 registration service failures into one exact message despite varying URLs', () => {
    for (let i = 0; i < 1500; i += 1) {
      const response = new Response(null, { status: 503 });
      Object.defineProperty(response, 'url', { value: `https://example.com/events/${i}/attendees/${i}?token=${i}` });
      logRegistrationFailure('registration,create-attendee', response);
    }
    expect(calls).to.have.lengthOf(1500);
    expect(new Set(calls.map(({ msg }) => msg))).to.deep.equal(
      new Set(['[registration,create-attendee] Request failed: http-status=503']),
    );
    calls.forEach(({ options }) => expect(options).to.deep.equal({ severity: 'critical', sampleRate: 100 }));
  });

  [400, 401, 403, 404, 409, 410, 422, 408, 429, 500, 503].forEach((status) => {
    it(`retains registration HTTP ${status} classification with a stable message`, () => {
      logRegistrationFailure('registration', { status, url: 'PRIVATE URL', body: 'PRIVATE BODY' });
      expect(calls[0].msg).to.equal(`[registration] Request failed: http-status=${status}`);
      expect(calls[0].options).to.deep.equal([408, 429, 500, 503].includes(status)
        ? { severity: 'critical', sampleRate: 100 } : { severity: 'warning' });
    });
  });

  [null, undefined, {}, { status: 'PRIVATE' }, { status: 900 }, { status: 400.5 }].forEach((response) => {
    it(`bounds invalid registration status ${JSON.stringify(response)} without dropping the failure`, () => {
      logRegistrationFailure('registration', response);
      expect(calls[0]).to.deep.equal({
        msg: '[registration] Request failed: http-status=unknown',
        options: { severity: 'critical', sampleRate: 100 },
      });
    });
  });

  it('groups request exceptions without including arbitrary error text or names', () => {
    const first = new Error('Failed to fetch PRIVATE URL');
    const second = new Error('PRIVATE BODY');
    second.name = 'PRIVATE ERROR NAME';
    [first, second, 'PRIVATE STRING', null].forEach((error) => logRegistrationError('registration', error));
    calls.forEach((call) => expect(call).to.deep.equal({
      msg: '[registration] Request failed: network-or-runtime',
      options: { severity: 'critical', sampleRate: 100 },
    }));
  });

  it('groups parse exceptions without including private response body fragments', () => {
    ['PRIVATE BODY A', 'PRIVATE BODY B'].forEach((message) => {
      logRegistrationError('registration', new SyntaxError(message));
    });
    calls.forEach((call) => expect(call).to.deep.equal({
      msg: '[registration] Invalid JSON response',
      options: { severity: 'critical', sampleRate: 100 },
    }));
  });

  it('forces full sampling for critical so it is never dropped by LANA\'s default 1% sample rate', () => {
    logCritical('scope', 'a');
    expect(calls[0].options.sampleRate).to.equal(100);
  });

  it('raises error to a 10% sample rate, well above LANA\'s default 1% but short of full sampling', () => {
    logError('scope', 'a');
    expect(calls[0].options.sampleRate).to.equal(10);
  });

  it('leaves debug, info, and warning at LANA\'s default sample rate', () => {
    logDebug('scope', 'a');
    logInfo('scope', 'b');
    logWarning('scope', 'c');
    calls.forEach((call) => expect(call.options).to.not.have.property('sampleRate'));
  });
});
