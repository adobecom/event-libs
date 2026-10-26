import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import logHydration from '../../../event-libs/v1/hydrate/log.js';

describe('hydration severity logging', () => {
  let sandbox;
  let originalLana;
  let lanaLog;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    originalLana = window.lana;
    lanaLog = sandbox.spy();
    window.lana = { log: lanaLog };
  });

  afterEach(() => {
    window.dispatchEvent(new Event('load'));
    window.lana = originalLana;
    sandbox.restore();
  });

  it('keeps scope in the message without emitting scope tags or changing options', () => {
    const options = { tags: 'hydrate,registry', severity: 'warning', sampleRate: 20 };

    logHydration('Missing hydrator', options);

    expect(lanaLog.calledOnce).to.be.true;
    expect(lanaLog.firstCall.args).to.deep.equal([
      '[hydrate,registry] Missing hydrator', { severity: 'warning', sampleRate: 20 },
    ]);
    expect(options.tags).to.equal('hydrate,registry');
  });

  it('supports messages with no scope or options', () => {
    logHydration('Hydration message');

    expect(lanaLog.firstCall.args).to.deep.equal(['Hydration message', {}]);
  });

  it('retains severity and scope once when flushed at load time', () => {
    sandbox.stub(document, 'readyState').get(() => 'loading');
    delete window.lana;

    logHydration('Deferred message', { tags: 'hydrate,image-links', severity: 'error' });
    window.lana = { log: lanaLog };
    window.dispatchEvent(new Event('load'));
    window.dispatchEvent(new Event('load'));

    expect(lanaLog.calledOnce).to.be.true;
    expect(lanaLog.firstCall.args).to.deep.equal([
      '[hydrate,image-links] Deferred message', { severity: 'error' },
    ]);
  });

  it('retains severity and scope once when lana initializes after the load event', async () => {
    sandbox.stub(document, 'readyState').get(() => 'complete');
    const clock = sandbox.useFakeTimers();
    delete window.lana;

    logHydration('Late message', { tags: 'hydrate,repeat-template', severity: 'warning' });
    window.lana = { log: lanaLog };
    await clock.tickAsync(100);
    window.dispatchEvent(new Event('load'));
    await clock.tickAsync(500);

    expect(lanaLog.calledOnce).to.be.true;
    expect(lanaLog.firstCall.args).to.deep.equal([
      '[hydrate,repeat-template] Late message', { severity: 'warning' },
    ]);
  });
});
