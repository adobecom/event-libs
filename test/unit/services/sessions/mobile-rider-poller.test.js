import { expect } from '@esm-bundle/chai';
import { registerStreamIds, unregisterStreamIds, subscribe } from '../../../../event-libs/v1/services/sessions/mobile-rider-poller.js';

function stubFetch(responses) {
  const calls = [];
  window.fetch = async (url) => {
    calls.push(url);
    const ids = new URL(url).searchParams.get('ids').split(',');
    const response = responses.shift() || { active: [], inactive: ids };
    return new Response(JSON.stringify(response));
  };
  return calls;
}

describe('mobile-rider-poller', () => {
  let realFetch;

  beforeEach(() => {
    realFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = realFetch;
  });

  it('batches ids from multiple registrants into a single request', async () => {
    const calls = stubFetch([{ active: [], inactive: ['a', 'b'] }]);
    registerStreamIds(['a']);
    registerStreamIds(['b']);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(calls.length).to.equal(1);
    const requestedIds = new URL(calls[0]).searchParams.get('ids').split(',');
    expect(requestedIds.sort()).to.deep.equal(['a', 'b']);

    unregisterStreamIds(['a']);
    unregisterStreamIds(['b']);
  });

  it('keeps an id registered while any registrant still needs it', async () => {
    const calls = stubFetch([{ active: [], inactive: ['shared'] }]);
    registerStreamIds(['shared']);
    registerStreamIds(['shared']);
    unregisterStreamIds(['shared']);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(calls.length).to.equal(1);
    expect(calls[0]).to.contain('shared');

    unregisterStreamIds(['shared']);
  });

  it('notifies subscribers with the poll result', async () => {
    stubFetch([{ active: ['x'], inactive: [] }]);
    let received = null;
    const unsubscribe = subscribe((result) => { received = result; });
    registerStreamIds(['x']);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(received).to.deep.equal({ active: ['x'], inactive: [] });

    unsubscribe();
    unregisterStreamIds(['x']);
  });

  it('stops notifying after unsubscribe', async () => {
    stubFetch([{ active: [], inactive: ['y'] }]);
    let calls = 0;
    const unsubscribe = subscribe(() => { calls += 1; });
    unsubscribe();
    registerStreamIds(['y']);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(calls).to.equal(0);

    unregisterStreamIds(['y']);
  });
});
