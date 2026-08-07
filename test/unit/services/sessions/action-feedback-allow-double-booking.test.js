import { expect } from '@esm-bundle/chai';

import { scheduleWithFeedback } from '../../../../event-libs/v1/services/sessions/action-feedback.js';
import { conflict } from '../../../../event-libs/v1/features/conflict-modal/conflict-modal.js';
import { initTierOneEventConfig } from '../../../../event-libs/v1/utils/tier-1-event-config.js';
import {
  auth, sessions, scheduled, pendingActions,
} from '../../../../event-libs/v1/utils/session-store.js';

// Separate file from action-feedback.test.js: initTierOneEventConfig() only ever
// parses metadata once per module instance, so a page authoring allowDoubleBooking:
// true has to be set up before any other test in this file's module graph runs.
describe('services/sessions/action-feedback (allowDoubleBooking: true)', () => {
  before(() => {
    const meta = document.createElement('meta');
    meta.name = 'tier-1-event-config';
    meta.content = JSON.stringify({ allowDoubleBooking: true });
    document.head.appendChild(meta);
    initTierOneEventConfig();
  });

  it('does not surface the conflict modal for a real time conflict when allowDoubleBooking is true', async () => {
    auth.value = { isLoggedIn: true, isRegistered: true, userFirstName: null };
    pendingActions.value = new Set();
    conflict.value = null;
    const existingSession = {
      id: 'existing', startTimeUtc: '2026-10-28T16:00:00Z', endTimeUtc: '2026-10-28T17:00:00Z',
    };
    const incoming = {
      id: 'incoming', startTimeUtc: '2026-10-28T16:30:00Z', endTimeUtc: '2026-10-28T17:30:00Z', rfCode: 'incoming-rf',
    };
    sessions.value = [existingSession, incoming];
    scheduled.value = new Set(['existing']);

    // scheduleSession's underlying ESP call isn't mocked here and will reject in this
    // harness — irrelevant to what's under test (the conflict gate is skipped before
    // that call happens at all), so only conflict.value is asserted.
    await scheduleWithFeedback(incoming, {
      eventConfig: { title: 'Adobe MAX 2026' }, isScheduled: false,
    });

    expect(conflict.value).to.equal(null);
  });
});
