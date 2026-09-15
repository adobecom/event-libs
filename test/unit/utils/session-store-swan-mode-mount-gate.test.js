import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import BlockMediator from '../../../event-libs/v1/deps/block-mediator.min.js';

// session-store.js holds module-level singleton state (initialized, apiConfig, etc.) that
// @web/test-runner does not reliably reset between test files sharing a worker session —
// cache-bust the import so this file gets its own fresh instance regardless.
const {
  initSessionState, sessionsStatus,
} = await import(`../../../event-libs/v1/utils/session-store.js?t=${Math.random()}`);

function waitForSessionsReady() {
  if (sessionsStatus.value === 'ready') return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = sessionsStatus.subscribe((status) => {
      if (status !== 'ready') return;
      unsubscribe();
      resolve();
    });
  });
}

function setMeta(name, content) {
  document.head.querySelector(`meta[name="${name}"]`)?.remove();
  if (content === undefined) return;
  const meta = document.createElement('meta');
  meta.name = name;
  meta.content = content;
  document.head.appendChild(meta);
}

// Only ever asserts absence of the widget, never a successful mount — notification-widget.js's
// own `mounted` guard is a real, permanent singleton for the whole browser test run, and its
// one sanctioned successful build lives in notification-widget.test.js (see that file's and
// notification-widget-mount-retry.test.js's header comments on the ordering this all depends
// on). A real `.feds-notifications-wrapper` + gnav-notifications=on are both present here, so
// if session-store.js's mode gate were ever loosened to call mountNotificationWidget() outside
// feds mode, this would genuinely catch it (the bell would actually build).
describe('session-store: mountNotificationWidget is only ever attempted in feds mode', () => {
  let originalFetch;
  let mountPoint;

  before(() => {
    originalFetch = window.fetch;
    window.fetch = async (url) => {
      if (typeof url === 'string' && url.includes('session-catalog')) {
        return { ok: true, status: 200, json: async () => ({ sessions: [], sessionTimes: [], speakers: [] }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    setMeta('gnav-notifications', 'on');
    mountPoint = document.createElement('div');
    mountPoint.className = 'feds-notifications-wrapper';
    document.body.append(mountPoint);
  });

  after(() => {
    window.fetch = originalFetch;
    setMeta('gnav-notifications');
    setMeta('swan-notifications');
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
    mountPoint.remove();
    BlockMediator.set('imsProfile', undefined);
  });

  async function loginAndSettle() {
    BlockMediator.set('imsProfile', { first_name: 'Test', account_type: 'type1', userId: 'user-swan-gate' });
    await waitForSessionsReady();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('never mounts the bell in unc mode, even with a real placeholder and gnav-notifications=on present', async () => {
    setMeta('swan-notifications', 'unc');
    setMetadata('tier-1-event-config', JSON.stringify({}));
    initSessionState();
    await loginAndSettle();
    expect(mountPoint.querySelector('.swan-notif')).to.equal(null);
  });

  it('never mounts the bell when swan-notifications is off/missing either', async () => {
    setMeta('swan-notifications');
    await loginAndSettle();
    expect(mountPoint.querySelector('.swan-notif')).to.equal(null);
  });
});
