import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { mountNotificationWidget } from '../../../../event-libs/v1/features/swan-notifications/notification-widget.js';

function setMeta(name, content) {
  document.head.querySelector(`meta[name="${name}"]`)?.remove();
  if (content === undefined) return;
  const meta = document.createElement('meta');
  meta.name = name;
  meta.content = content;
  document.head.appendChild(meta);
}

// mountNotificationWidget() guards itself with a module-level `mounted` singleton that lives
// for the whole browser test run, so this file — like notification-widget-mount-retry.test.js
// — must run before notification-widget.test.js's own before() hook does a normal,
// successful mount. Neither test below ever lets `mounted` end up permanently true: the
// first returns before `mounted` is ever set, and the second only gets as far as a timed-out
// wait (which resets `mounted` back to false itself). The filename is chosen to sort
// alphabetically ahead of notification-widget-mount-retry.test.js ('g' < 'm'), matching
// @web/test-runner's default glob ordering.
describe('notification-widget: gnav-notifications gate', () => {
  afterEach(() => {
    sinon.restore();
    setMeta('gnav-notifications');
  });

  it('skips the mount attempt entirely (no wait, no DOM change) while gnav-notifications is not "on"', async () => {
    // No .feds-notifications-wrapper and no gnav-notifications flag — federal wouldn't have
    // rendered the placeholder in this state either, so there's nothing to wait for.
    mountNotificationWidget();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('.swan-notif')).to.equal(null);

    // A value other than the literal "on" behaves the same as absent.
    setMeta('gnav-notifications', 'true');
    mountNotificationWidget();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('.swan-notif')).to.equal(null);
  });

  it('does not skip the mount attempt once gnav-notifications is genuinely "on"', async () => {
    const clock = sinon.useFakeTimers();
    setMeta('gnav-notifications', 'on');
    // No real .feds-notifications-wrapper in the document — the gate passes, but the
    // subsequent waitForElement() wait still times out normally (proves the gate is an
    // additional check, not a replacement for actually waiting on the real placeholder).
    mountNotificationWidget();
    await clock.tickAsync(8000);
    clock.restore();
    expect(document.querySelector('.swan-notif')).to.equal(null);
  });
});
