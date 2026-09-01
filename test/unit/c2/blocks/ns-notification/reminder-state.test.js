import { expect } from '@esm-bundle/chai';
import {
  REMINDER_STATES,
  classifyReminderState,
  computeNextTransitionMs,
  buildNotificationPayload,
  diffNotificationState,
} from '../../../../../event-libs/v1/c2/blocks/ns-notification/reminder-state.js';

const LEAD_TIME_MINUTES = 5;
const START = Date.parse('2026-09-01T18:00:00.000Z');
const END = Date.parse('2026-09-01T19:00:00.000Z');
const REMINDER_AT = START - LEAD_TIME_MINUTES * 60_000;
const NO_LIVE_STREAMS = new Set();

function session(overrides = {}) {
  return {
    id: 'session-1',
    title: 'Test Session',
    sessionPageUrl: 'https://example.com/session-1',
    startTimeUtc: new Date(START).toISOString(),
    endTimeUtc: new Date(END).toISOString(),
    ...overrides,
  };
}

describe('reminder-state', () => {
  describe('classifyReminderState', () => {
    it('is idle well before the lead-time window', () => {
      expect(classifyReminderState(session(), NO_LIVE_STREAMS, LEAD_TIME_MINUTES, REMINDER_AT - 60_000))
        .to.equal(REMINDER_STATES.IDLE);
    });

    it('is reminder exactly at the lead-time boundary', () => {
      expect(classifyReminderState(session(), NO_LIVE_STREAMS, LEAD_TIME_MINUTES, REMINDER_AT))
        .to.equal(REMINDER_STATES.REMINDER);
    });

    it('is reminder mid-window', () => {
      expect(classifyReminderState(session(), NO_LIVE_STREAMS, LEAD_TIME_MINUTES, REMINDER_AT + 60_000))
        .to.equal(REMINDER_STATES.REMINDER);
    });

    it('is live exactly at start', () => {
      expect(classifyReminderState(session(), NO_LIVE_STREAMS, LEAD_TIME_MINUTES, START))
        .to.equal(REMINDER_STATES.LIVE);
    });

    it('is live mid-session', () => {
      expect(classifyReminderState(session(), NO_LIVE_STREAMS, LEAD_TIME_MINUTES, START + 60_000))
        .to.equal(REMINDER_STATES.LIVE);
    });

    it('is still live exactly at end (deriveSessionState treats the end boundary as exclusive: nowMs > end, not >=)', () => {
      expect(classifyReminderState(session(), NO_LIVE_STREAMS, LEAD_TIME_MINUTES, END))
        .to.equal(REMINDER_STATES.LIVE);
    });

    it('is on-demand just after end', () => {
      expect(classifyReminderState(session(), NO_LIVE_STREAMS, LEAD_TIME_MINUTES, END + 1))
        .to.equal(REMINDER_STATES.ON_DEMAND);
    });

    it('is always on-demand for hasOnDemandFormat sessions, regardless of the clock', () => {
      const s = session({ hasOnDemandFormat: true });
      expect(classifyReminderState(s, NO_LIVE_STREAMS, LEAD_TIME_MINUTES, REMINDER_AT - 60_000))
        .to.equal(REMINDER_STATES.ON_DEMAND);
    });

    describe('MR-livestream sessions (deriveSessionState delegation)', () => {
      it('is reminder past the lead-time boundary even if the MR poll has not activated yet', () => {
        const s = session({ mrStreamId: 'mr-1' });
        expect(classifyReminderState(s, NO_LIVE_STREAMS, LEAD_TIME_MINUTES, REMINDER_AT + 60_000))
          .to.equal(REMINDER_STATES.REMINDER);
      });

      it('is on-demand (not live) at start if the MR poll never activated', () => {
        const s = session({ mrStreamId: 'mr-1' });
        expect(classifyReminderState(s, NO_LIVE_STREAMS, LEAD_TIME_MINUTES, START + 60_000))
          .to.equal(REMINDER_STATES.ON_DEMAND);
      });

      it('is live at start only once the MR poll confirms the stream is active', () => {
        const s = session({ mrStreamId: 'mr-1' });
        const activeStreams = new Set(['mr-1']);
        expect(classifyReminderState(s, activeStreams, LEAD_TIME_MINUTES, START + 60_000))
          .to.equal(REMINDER_STATES.LIVE);
      });

      it('stays live past endTimeUtc while the MR poll still reports active (poll-driven, not clock-driven)', () => {
        const s = session({ mrStreamId: 'mr-1' });
        const activeStreams = new Set(['mr-1']);
        expect(classifyReminderState(s, activeStreams, LEAD_TIME_MINUTES, END + 60_000))
          .to.equal(REMINDER_STATES.LIVE);
      });
    });
  });

  describe('computeNextTransitionMs', () => {
    it('returns ms until the reminder boundary when idle', () => {
      const now = REMINDER_AT - 60_000;
      expect(computeNextTransitionMs(session(), NO_LIVE_STREAMS, LEAD_TIME_MINUTES, now)).to.equal(60_000);
    });

    it('returns ms until start when in the reminder window', () => {
      const now = REMINDER_AT + 60_000;
      expect(computeNextTransitionMs(session(), NO_LIVE_STREAMS, LEAD_TIME_MINUTES, now)).to.equal(START - now);
    });

    it('returns ms until end when live (non-MR — a deterministic clock boundary)', () => {
      const now = START + 60_000;
      expect(computeNextTransitionMs(session(), NO_LIVE_STREAMS, LEAD_TIME_MINUTES, now)).to.equal(END - now);
    });

    it('returns null once on-demand', () => {
      expect(computeNextTransitionMs(session(), NO_LIVE_STREAMS, LEAD_TIME_MINUTES, END + 1)).to.be.null;
    });

    it('returns null for hasOnDemandFormat sessions', () => {
      const s = session({ hasOnDemandFormat: true });
      expect(computeNextTransitionMs(s, NO_LIVE_STREAMS, LEAD_TIME_MINUTES, REMINDER_AT - 60_000)).to.be.null;
    });

    it('returns null once an MR session is live, instead of a clock target at endTimeUtc', () => {
      // Regression guard: scheduling a wake-up at endTimeUtc for an MR session that's
      // still live per the poll would refire every tick at ~0ms once nowMs passes end,
      // since deriveSessionState keeps it 'live' until the poll itself deactivates.
      const s = session({ mrStreamId: 'mr-1' });
      const activeStreams = new Set(['mr-1']);
      expect(computeNextTransitionMs(s, activeStreams, LEAD_TIME_MINUTES, END + 60_000)).to.be.null;
    });
  });

  describe('buildNotificationPayload', () => {
    it('builds the wire payload from a session and state', () => {
      const payload = buildNotificationPayload(
        session(),
        REMINDER_STATES.REMINDER,
        { title: 'Adobe MAX 2026' },
      );
      expect(payload).to.include({
        id: 'session-1',
        label: REMINDER_STATES.REMINDER,
        title: 'Adobe MAX 2026',
        message: 'Test Session',
        url: 'https://example.com/session-1',
      });
      expect(payload.createdAt).to.be.a('number');
    });

    it('falls back to defaults when eventConfig/session fields are missing', () => {
      const payload = buildNotificationPayload(session({ title: undefined }), REMINDER_STATES.LIVE);
      expect(payload.title).to.equal('Adobe Event Session');
      expect(payload.message).to.equal('');
    });
  });

  describe('diffNotificationState', () => {
    it('adds a new entry not present in previous', () => {
      const next = new Map([['session-1', REMINDER_STATES.REMINDER]]);
      const sessionsById = new Map([['session-1', session()]]);
      const { toAdd, toEdit, toRemove } = diffNotificationState(new Map(), next, sessionsById, {});
      expect(toAdd).to.have.lengthOf(1);
      expect(toAdd[0].id).to.equal('session-1');
      expect(toEdit).to.be.empty;
      expect(toRemove).to.be.empty;
    });

    it('edits an entry whose state changed', () => {
      const previous = new Map([['session-1', REMINDER_STATES.REMINDER]]);
      const next = new Map([['session-1', REMINDER_STATES.LIVE]]);
      const sessionsById = new Map([['session-1', session()]]);
      const { toAdd, toEdit, toRemove } = diffNotificationState(previous, next, sessionsById, {});
      expect(toAdd).to.be.empty;
      expect(toEdit).to.have.lengthOf(1);
      expect(toEdit[0]).to.include({ id: 'session-1' });
      expect(toEdit[0].patch.label).to.equal(REMINDER_STATES.LIVE);
      expect(toRemove).to.be.empty;
    });

    it('does nothing for an entry whose state is unchanged', () => {
      const previous = new Map([['session-1', REMINDER_STATES.LIVE]]);
      const next = new Map([['session-1', REMINDER_STATES.LIVE]]);
      const sessionsById = new Map([['session-1', session()]]);
      const { toAdd, toEdit, toRemove } = diffNotificationState(previous, next, sessionsById, {});
      expect(toAdd).to.be.empty;
      expect(toEdit).to.be.empty;
      expect(toRemove).to.be.empty;
    });

    it('removes an orphan present in previous but absent from next (unscheduled)', () => {
      const previous = new Map([['session-1', REMINDER_STATES.REMINDER]]);
      const { toAdd, toEdit, toRemove } = diffNotificationState(previous, new Map(), new Map(), {});
      expect(toAdd).to.be.empty;
      expect(toEdit).to.be.empty;
      expect(toRemove).to.deep.equal(['session-1']);
    });

    it('skips an id in next whose session data is missing (defensive)', () => {
      const next = new Map([['missing-session', REMINDER_STATES.REMINDER]]);
      const { toAdd } = diffNotificationState(new Map(), next, new Map(), {});
      expect(toAdd).to.be.empty;
    });
  });
});
