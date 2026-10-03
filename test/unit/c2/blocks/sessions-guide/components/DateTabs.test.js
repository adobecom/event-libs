import { expect } from '@esm-bundle/chai';
import { DateTabs } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/DateTabs.js';
import { SessionGuideContext } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js';
import {
  sessions, liveStreamActiveIds, sessionStateVersion,
} from '../../../../../../event-libs/v1/utils/session-store.js';

const HOUR = 3_600_000;
const ago = (h) => new Date(Date.now() - h * HOUR).toISOString();
const ahead = (h) => new Date(Date.now() + h * HOUR).toISOString();

function setState(activeView) {
  SessionGuideContext._current = {
    state: { activeView, activeDay: '2026-11-10', eventDays: ['2026-11-10', '2026-11-11'] },
    dispatch: () => {},
  };
}

describe('DateTabs', () => {
  beforeEach(() => {
    sessions.value = [{
      id: 'upcoming', mrStreamId: null, startTimeUtc: ahead(1), endTimeUtc: ahead(2),
    }];
    liveStreamActiveIds.value = new Set();
    sessionStateVersion.value = 0;
    setState('live-upcoming');
  });

  it('renders the date tabs during the event', () => {
    const out = DateTabs();
    expect(out).to.include('sg-date-tabs');
    expect(out).to.not.include('sg-date-tabs--disabled');
  });

  it('keeps the date tabs but disables them for On demand during the event', () => {
    setState('on-demand');
    expect(DateTabs()).to.include('sg-date-tabs--disabled');
  });

  it('removes the date tabs post-event', () => {
    sessions.value = [{
      id: 'ended', mrStreamId: null, startTimeUtc: ago(4), endTimeUtc: ago(3),
    }];
    setState('on-demand');
    expect(DateTabs()).to.equal(null);
  });
});
