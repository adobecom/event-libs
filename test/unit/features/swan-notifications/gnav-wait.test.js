import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { waitForElement } from '../../../../event-libs/v1/features/swan-notifications/gnav-wait.js';

const SELECTOR = '.gnav-wait-test-target';

function removeTarget() {
  document.querySelector(SELECTOR)?.remove();
}

describe('gnav-wait', () => {
  afterEach(() => {
    removeTarget();
    sinon.restore();
  });

  it('resolves immediately when the element is already present', async () => {
    const el = document.createElement('div');
    el.className = 'gnav-wait-test-target';
    document.body.append(el);

    const result = await waitForElement(SELECTOR);
    expect(result).to.equal(el);
  });

  it('polls until the element appears', async () => {
    const clock = sinon.useFakeTimers();
    const promise = waitForElement(SELECTOR, { timeout: 2000, interval: 100 });

    await clock.tickAsync(300);
    const el = document.createElement('div');
    el.className = 'gnav-wait-test-target';
    document.body.append(el);

    await clock.tickAsync(100);
    expect(await promise).to.equal(el);
  });

  it('resolves to null once the timeout elapses and the element never appears', async () => {
    const clock = sinon.useFakeTimers();
    const promise = waitForElement(SELECTOR, { timeout: 1000, interval: 100 });
    await clock.tickAsync(1000);
    expect(await promise).to.equal(null);
  });

  it('resolves as soon as a gnav:ready event fires, without waiting for the next poll', async () => {
    const clock = sinon.useFakeTimers();
    const promise = waitForElement(SELECTOR, { timeout: 5000, interval: 1000 });

    // Element appears together with the ready signal, well before the first poll tick.
    const el = document.createElement('div');
    el.className = 'gnav-wait-test-target';
    document.body.append(el);
    document.dispatchEvent(new CustomEvent('gnav:ready'));

    await clock.tickAsync(0);
    expect(await promise).to.equal(el);
  });

  it('stops listening for gnav:ready and stops polling once settled', async () => {
    const clock = sinon.useFakeTimers();
    const removeSpy = sinon.spy(document, 'removeEventListener');
    const promise = waitForElement(SELECTOR, { timeout: 1000, interval: 100 });
    await clock.tickAsync(1000);
    await promise;
    expect(removeSpy.calledWith('gnav:ready')).to.equal(true);
  });
});
