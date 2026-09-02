import { expect } from '@esm-bundle/chai';
import { useIsPostEvent } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/utils/use-post-event.js';
import {
  sessions, liveStreamActiveIds, sessionStateVersion,
} from '../../../../../../event-libs/v1/utils/session-store.js';

const HOUR = 3_600_000;
const ago = (h) => new Date(Date.now() - h * HOUR).toISOString();
const ahead = (h) => new Date(Date.now() + h * HOUR).toISOString();

// Both DrawerHeader and ViewDropdown read post-event state through this hook, and neither
// covered the signal wiring before — their own tests inject isPost as a parameter.
describe('sessions-guide/utils/useIsPostEvent', () => {
  beforeEach(() => {
    sessions.value = [];
    liveStreamActiveIds.value = new Set();
    sessionStateVersion.value = 0;
  });

  it('is false for an empty session list, which alone never means the event ended', () => {
    expect(useIsPostEvent()).to.be.false;
  });

  it('is false while a session is still upcoming', () => {
    sessions.value = [
      { id: 'a', mrStreamId: null, startTimeUtc: ago(3), endTimeUtc: ago(2) },
      { id: 'b', mrStreamId: null, startTimeUtc: ahead(1), endTimeUtc: ahead(2) },
    ];
    expect(useIsPostEvent()).to.be.false;
  });

  it('is true once every session has gone on-demand', () => {
    sessions.value = [
      { id: 'a', mrStreamId: null, startTimeUtc: ago(4), endTimeUtc: ago(3) },
      { id: 'b', mrStreamId: null, startTimeUtc: ago(3), endTimeUtc: ago(2) },
    ];
    expect(useIsPostEvent()).to.be.true;
  });

  // The value is read off live signals, so it has to follow them rather than latch.
  it('tracks the sessions signal rather than caching its first read', () => {
    sessions.value = [{ id: 'a', mrStreamId: null, startTimeUtc: ahead(1), endTimeUtc: ahead(2) }];
    expect(useIsPostEvent()).to.be.false;
    sessions.value = [{ id: 'a', mrStreamId: null, startTimeUtc: ago(3), endTimeUtc: ago(2) }];
    expect(useIsPostEvent()).to.be.true;
  });
});
