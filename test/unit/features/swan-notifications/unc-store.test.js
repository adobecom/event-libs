import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { whenUncStoreReady } from '../../../../event-libs/v1/features/swan-notifications/unc-store.js';

describe('unc-store', () => {
  let originalFeds;

  beforeEach(() => {
    originalFeds = window.feds;
    delete window.feds;
  });

  afterEach(() => {
    window.feds = originalFeds;
    sinon.restore();
  });

  it('resolves immediately when window.feds.data.notifications already exists', async () => {
    const store = { get: () => [] };
    window.feds = { data: { notifications: store } };
    const resolved = await whenUncStoreReady();
    expect(resolved).to.equal(store);
  });

  it('resolves once feds.data.notifications.loaded fires after the store appears', async () => {
    const promise = whenUncStoreReady();
    const store = { get: () => [] };
    window.feds = { data: { notifications: store } };
    window.dispatchEvent(new CustomEvent('feds.data.notifications.loaded'));
    expect(await promise).to.equal(store);
  });

  it('resolves to null once the timeout elapses and the store never appeared', async () => {
    const clock = sinon.useFakeTimers();
    const promise = whenUncStoreReady(1000);
    clock.tick(1000);
    expect(await promise).to.equal(null);
  });

  it('removes its own event listener once the timeout wins, instead of leaking it', async () => {
    const removeSpy = sinon.spy(window, 'removeEventListener');
    const clock = sinon.useFakeTimers();
    const promise = whenUncStoreReady(1000);
    clock.tick(1000);
    await promise;
    expect(removeSpy.calledWith('feds.data.notifications.loaded')).to.equal(true);
  });

  it('clears its own timeout once the ready event wins, instead of resolving null later', async () => {
    const clock = sinon.useFakeTimers();
    const promise = whenUncStoreReady(1000);
    const store = { get: () => [] };
    window.feds = { data: { notifications: store } };
    window.dispatchEvent(new CustomEvent('feds.data.notifications.loaded'));
    clock.tick(1000);
    expect(await promise).to.equal(store);
  });
});
