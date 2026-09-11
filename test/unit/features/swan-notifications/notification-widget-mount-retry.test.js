import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { mountNotificationWidget } from '../../../../event-libs/v1/features/swan-notifications/notification-widget.js';
import { upsertEntry, getEntries, removeEntry } from '../../../../event-libs/v1/features/swan-notifications/notification-store.js';

// mountNotificationWidget() guards itself with a module-level `mounted` singleton that
// lives for the whole browser test run. This file must be the first thing in the suite to
// ever call mountNotificationWidget(), so it can exercise the "gnav utility bar never
// appeared" path — where #universal-nav genuinely doesn't exist yet — before
// notification-widget.test.js's own before() hook does a normal, successful mount (which
// would otherwise leave `mounted` permanently true for the rest of the run). The filename
// is chosen to sort alphabetically ahead of notification-widget.test.js ('-' < '.' in
// ASCII), matching @web/test-runner's default glob ordering.
describe('notification-widget: mount retry after a failed wait', () => {
  afterEach(() => {
    sinon.restore();
    document.querySelector('#universal-nav')?.remove();
    getEntries().forEach((entry) => removeEntry(entry.rfCode));
  });

  it('resets its mounted guard on a timed-out wait, so a later call can still succeed', async () => {
    const clock = sinon.useFakeTimers();
    mountNotificationWidget();
    // gnav-wait.js's default timeout — nothing in the document matches #universal-nav.
    await clock.tickAsync(8000);
    clock.restore();
    expect(document.querySelector('.swan-notif')).to.equal(null);

    // Simulates an unread entry already persisted from an earlier visit, before the widget
    // ever builds its DOM. This is deliberately exercised here rather than in
    // notification-widget.test.js: `notifications.subscribe()` fires synchronously with
    // whatever's already in the store the moment buildWidget() subscribes, and this is the
    // one point in the whole suite where that subscription is genuinely happening for the
    // first time (mountNotificationWidget()'s `mounted` guard makes every later mount call,
    // in every other file, a no-op).
    upsertEntry('RF-preexisting', { stage: 'reminder', title: 'Preexisting' });

    // The mount point now exists. If `mounted` were left permanently true by the timed-out
    // attempt above, this second call would silently no-op and the bell would never mount
    // for the rest of the page session.
    const mount = document.createElement('div');
    mount.id = 'universal-nav';
    document.body.append(mount);

    mountNotificationWidget();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mount.querySelector('.swan-notif')).to.not.equal(null);
    // Must NOT announce the pre-existing entry as "new" on this first render.
    expect(mount.querySelector('.swan-notif__sr-only').textContent).to.equal('');
  });
});
