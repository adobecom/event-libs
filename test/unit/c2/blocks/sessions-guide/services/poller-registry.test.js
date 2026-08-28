import { expect } from '@esm-bundle/chai';
import { registerStreamIds, unregisterStreamIds, subscribe } from '../../../../../../event-libs/v1/services/sessions/poller.js';

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

describe('poller registry', () => {
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

  it('fires an immediate extra fetch when a new id joins an already-polling group', async () => {
    const calls = stubFetch([
      { active: [], inactive: ['p'] },
      { active: [], inactive: ['p', 'q'] },
    ]);
    registerStreamIds(['p']);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls.length).to.equal(1);

    // 'q' joins a group whose 30s interval is already running — it shouldn't have to wait
    // for that interval to come back around.
    registerStreamIds(['q']);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(calls.length).to.equal(2);
    const secondCallIds = new URL(calls[1]).searchParams.get('ids').split(',');
    expect(secondCallIds.sort()).to.deep.equal(['p', 'q']);

    unregisterStreamIds(['p', 'q']);
  });

  it('does not fire an extra fetch when re-registering an id that is already tracked', async () => {
    const calls = stubFetch([{ active: [], inactive: ['r'] }]);
    registerStreamIds(['r']);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls.length).to.equal(1);

    // Same id, no new ids in the mix — already due on the next scheduled tick like anything
    // else in the group, so this shouldn't trigger a tick of its own.
    registerStreamIds(['r']);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls.length).to.equal(1);

    unregisterStreamIds(['r']);
    unregisterStreamIds(['r']);
  });

  it('waits for an in-flight fetch to resolve before re-ticking for a new id, instead of racing a second request', async () => {
    const calls = [];
    let resolveFirst;
    window.fetch = async (url) => {
      calls.push(url);
      if (calls.length === 1) {
        return new Promise((resolve) => {
          resolveFirst = () => resolve(new Response(JSON.stringify({ active: [], inactive: ['s'] })));
        });
      }
      return new Response(JSON.stringify({ active: [], inactive: ['s', 't'] }));
    };

    registerStreamIds(['s']);
    // Let the first (immediate) tick start and hang mid-flight.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls.length).to.equal(1);

    // 't' arrives while the first fetch is still in the air.
    registerStreamIds(['t']);
    await new Promise((resolve) => setTimeout(resolve, 10));
    // No second concurrent request — the new id is queued behind the in-flight one.
    expect(calls.length).to.equal(1);

    resolveFirst();
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The follow-up tick fired as soon as the first resolved, picking up both ids.
    expect(calls.length).to.equal(2);
    const secondIds = new URL(calls[1]).searchParams.get('ids').split(',');
    expect(secondIds.sort()).to.deep.equal(['s', 't']);

    unregisterStreamIds(['s', 't']);
  });
});
