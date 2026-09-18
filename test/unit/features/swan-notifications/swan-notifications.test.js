import { expect } from '@esm-bundle/chai';
import {
  notifySessionScheduled, notifySessionUnscheduled, reconcileSwanNotifications,
} from '../../../../event-libs/v1/features/swan-notifications/swan-notifications.js';
import { getEntry, getEntries, removeEntry } from '../../../../event-libs/v1/features/swan-notifications/notification-store.js';

const STATE_KEY = 'swan-notification-state-v2';

function setMeta(name, content) {
  document.head.querySelector(`meta[name="${name}"]`)?.remove();
  if (content === undefined) return;
  const meta = document.createElement('meta');
  meta.name = name;
  meta.content = content;
  document.head.appendChild(meta);
}

function makeSession(rfCode) {
  return {
    id: `session-${rfCode}`,
    rfCode,
    title: `Session ${rfCode}`,
    sessionPageUrl: `/sessions/${rfCode}`,
    startTimeUtc: new Date(Date.now() - 60 * 1000).toISOString(),
    endTimeUtc: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };
}

function clearStore() {
  getEntries().forEach((entry) => removeEntry(entry.rfCode));
}

// Mode selection itself (getSwanMode()'s feds/unc/off value) lives in swan-config.js — see
// swan-config.test.js. These tests only prove the router hands off to the right underlying
// module; each module's own stage-machine behavior is covered in its own test file
// (swan-notifications-feds.test.js, swan-notifications-unc.test.js).
describe('swan-notifications (mode router)', () => {
  afterEach(() => {
    setMeta('swan-notifications');
    delete window.UniversalNav;
    window.localStorage.removeItem(STATE_KEY);
    clearStore();
  });

  it('routes to swan-notifications-feds.js when swan-notifications=feds', () => {
    setMeta('swan-notifications', 'feds');
    const session = makeSession('RF-router-feds');
    notifySessionScheduled(session);
    expect(getEntry('RF-router-feds')).to.not.equal(undefined);
  });

  it('routes to swan-notifications-unc.js when swan-notifications=unc', async () => {
    setMeta('swan-notifications', 'unc');
    const calls = [];
    window.UniversalNav = {
      getComponent: async () => ({
        instance: {
          UpsertReminderFeatureFlag: (payload) => calls.push(payload),
          DeleteReminderFeatureFlag: () => {},
        },
      }),
    };

    const session = makeSession('RF-router-unc');
    await notifySessionScheduled(session);

    expect(calls).to.have.lengthOf(1);
    // unc mode never touches the local widget's notification store.
    expect(getEntry('RF-router-unc')).to.equal(undefined);
  });

  it('no-ops for off, missing, and unrecognized values', async () => {
    const session = makeSession('RF-router-off');

    setMeta('swan-notifications'); // missing
    await notifySessionScheduled(session);
    setMeta('swan-notifications', 'off');
    await notifySessionUnscheduled(session);
    setMeta('swan-notifications', 'not-a-real-mode');
    await reconcileSwanNotifications(() => [session], () => new Set([session.id]));

    expect(getEntry('RF-router-off')).to.equal(undefined);
  });
});
