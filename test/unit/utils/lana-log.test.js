import { expect } from '@esm-bundle/chai';

import {
  logDebug, logInfo, logWarning, logError, logCritical,
} from '../../../event-libs/v1/utils/lana-log.js';

describe('lana-log', () => {
  let calls;
  let originalLog;

  beforeEach(() => {
    calls = [];
    originalLog = window.lana?.log;
    window.lana = { log: (msg, options) => calls.push({ msg, options }) };
  });

  afterEach(() => {
    window.lana.log = originalLog;
  });

  const CONTEXT_PATTERN = /\| ua=.*,viewport=\d+x\d+,lang=.*,env=(dev|stage|prod)$/;

  it('formats the message with a [scope] prefix and sets tags/severity from scope', () => {
    logError('my-scope', 'thing failed');
    expect(calls[0].msg).to.include('[my-scope] thing failed');
    expect(calls[0].options).to.deep.equal({ tags: 'my-scope', severity: 'error', sampleRate: 10 });
  });

  it('omits the trailing data suffix when no data is passed', () => {
    logError('scope', 'msg');
    expect(calls[0].msg).to.match(/^\[scope\] msg \|/);
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

  it('appends client context for warning, error, and critical severities', () => {
    logWarning('scope', 'a');
    logError('scope', 'b');
    logCritical('scope', 'c');
    calls.forEach((call) => expect(call.msg).to.match(CONTEXT_PATTERN));
  });

  it('does not append client context for debug or info severities', () => {
    logDebug('scope', 'a');
    logInfo('scope', 'b');
    calls.forEach((call) => expect(call.msg).to.not.match(/\| ua=/));
  });

  it('includes ua, viewport, lang, and env fields in the appended context', () => {
    logError('scope', 'msg');
    expect(calls[0].msg).to.match(CONTEXT_PATTERN);
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
