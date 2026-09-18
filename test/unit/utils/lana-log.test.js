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

  it('formats the message with a [scope] prefix and sets tags/severity from scope', () => {
    logError('my-scope', 'thing failed');
    expect(calls[0].msg).to.equal('[my-scope] thing failed');
    expect(calls[0].options).to.deep.equal({ tags: 'my-scope', severity: 'error' });
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
  });

  it('serializes an Error without producing "{}"', () => {
    logError('scope', 'msg', new Error('boom'));
    expect(calls[0].msg).to.equal('[scope] msg: Error: boom');
    expect(calls[0].msg).to.not.include('{}');
  });

  it('serializes a subclassed error using its own name, not a hardcoded "Error"', () => {
    logError('scope', 'msg', new TypeError('bad'));
    expect(calls[0].msg).to.equal('[scope] msg: TypeError: bad');
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
    expect(calls[0].msg).to.equal('[scope] msg: {"foo":"bar"}');
  });

  it('passes a thrown string through as-is rather than double-encoding it', () => {
    logError('scope', 'msg', 'oops');
    expect(calls[0].msg).to.equal('[scope] msg: oops');
  });

  it('falls back to String(data) for a circular object instead of throwing', () => {
    const circular = {};
    circular.self = circular;
    expect(() => logError('scope', 'msg', circular)).to.not.throw();
    expect(calls[0].msg).to.include('[object Object]');
  });
});
