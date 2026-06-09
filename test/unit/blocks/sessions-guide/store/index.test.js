import { expect } from '@esm-bundle/chai';
import { buildInitialState, reducer } from '../../../../../event-libs/v1/blocks/sessions-guide/store/index.js';

const MOCK_CONFIG = {
  title: 'Adobe MAX 2026',
  userTz: 'America/Los_Angeles',
  rfApiUrl: '',
  rfApiProfileId: '',
  showConflictModal: true,
  filterCategories: [],
  trackIcons: {},
  trackColors: {},
  manualOnDemandTransitionTime: null,
  theme: 'dark',
  mrEnv: 'dev',
};

const MOCK_SESSIONS = [
  { id: 'session-1', mrStreamId: null, startTimeUtc: '2026-10-28T17:00:00.000Z' },
  { id: 'session-2', mrStreamId: 'mr-123', startTimeUtc: '2026-10-29T17:00:00.000Z' },
];

describe('store/buildInitialState', () => {
  it('initializes sessions from initialSessions param', () => {
    const state = buildInitialState(MOCK_CONFIG, MOCK_SESSIONS);
    expect(state.sessions).to.deep.equal(MOCK_SESSIONS);
  });

  it('sets activeDay to first session day when sessions provided', () => {
    const state = buildInitialState(MOCK_CONFIG, MOCK_SESSIONS);
    expect(state.activeDay).to.equal('2026-10-28');
  });

  it('sets activeDay to empty string when no sessions', () => {
    const state = buildInitialState(MOCK_CONFIG, []);
    expect(state.activeDay).to.equal('');
  });

  it('derives eventDays from session start times', () => {
    const state = buildInitialState(MOCK_CONFIG, MOCK_SESSIONS);
    expect(state.eventDays).to.deep.equal(['2026-10-28', '2026-10-29']);
  });

  it('initializes scheduled and favorited as empty Sets', () => {
    const state = buildInitialState(MOCK_CONFIG, []);
    expect(state.scheduled).to.be.instanceOf(Set);
    expect(state.favorited).to.be.instanceOf(Set);
    expect(state.scheduled.size).to.equal(0);
    expect(state.favorited.size).to.equal(0);
  });

  it('sets isLoggedIn to null (IMS loading)', () => {
    const state = buildInitialState(MOCK_CONFIG, []);
    expect(state.isLoggedIn).to.be.null;
  });

  it('sets isRegistered to undefined (registration loading)', () => {
    const state = buildInitialState(MOCK_CONFIG, []);
    expect(state.isRegistered).to.be.undefined;
  });

  it('sets activeView to live-upcoming', () => {
    const state = buildInitialState(MOCK_CONFIG, []);
    expect(state.activeView).to.equal('live-upcoming');
  });

  it('sets sessionsStatus to loading when no initialSessions', () => {
    const state = buildInitialState(MOCK_CONFIG, []);
    expect(state.sessionsStatus).to.equal('loading');
  });

  it('sets sessionsStatus to ready when initialSessions provided', () => {
    const state = buildInitialState(MOCK_CONFIG, MOCK_SESSIONS);
    expect(state.sessionsStatus).to.equal('ready');
  });

  it('sets drawerState to hidden', () => {
    const state = buildInitialState(MOCK_CONFIG, []);
    expect(state.drawerState).to.equal('hidden');
  });
});

describe('store/reducer', () => {
  let baseState;

  beforeEach(() => {
    baseState = buildInitialState(MOCK_CONFIG, MOCK_SESSIONS);
  });

  it('INIT_USER_DATA sets scheduled and favorited from arrays', () => {
    const next = reducer(baseState, {
      type: 'INIT_USER_DATA',
      scheduled: ['session-1'],
      favorited: ['session-2'],
    });
    expect(next.scheduled.has('session-1')).to.be.true;
    expect(next.favorited.has('session-2')).to.be.true;
  });

  it('INIT_USER_DATA accepts Sets directly', () => {
    const next = reducer(baseState, {
      type: 'INIT_USER_DATA',
      scheduled: new Set(['session-1']),
      favorited: new Set(),
    });
    expect(next.scheduled.has('session-1')).to.be.true;
  });

  it('SCHEDULE_ADD adds a session ID', () => {
    const next = reducer(baseState, { type: 'SCHEDULE_ADD', sessionId: 'session-1' });
    expect(next.scheduled.has('session-1')).to.be.true;
  });

  it('SCHEDULE_REMOVE removes a session ID', () => {
    const withSession = reducer(baseState, { type: 'SCHEDULE_ADD', sessionId: 'session-1' });
    const next = reducer(withSession, { type: 'SCHEDULE_REMOVE', sessionId: 'session-1' });
    expect(next.scheduled.has('session-1')).to.be.false;
  });

  it('FAVORITE_ADD adds a session ID', () => {
    const next = reducer(baseState, { type: 'FAVORITE_ADD', sessionId: 'session-2' });
    expect(next.favorited.has('session-2')).to.be.true;
  });

  it('FAVORITE_REMOVE removes a session ID', () => {
    const withFav = reducer(baseState, { type: 'FAVORITE_ADD', sessionId: 'session-2' });
    const next = reducer(withFav, { type: 'FAVORITE_REMOVE', sessionId: 'session-2' });
    expect(next.favorited.has('session-2')).to.be.false;
  });

  it('SET_VIEW changes activeView', () => {
    const next = reducer(baseState, { type: 'SET_VIEW', view: 'on-demand' });
    expect(next.activeView).to.equal('on-demand');
  });

  it('SET_DAY changes activeDay', () => {
    const next = reducer(baseState, { type: 'SET_DAY', day: '2026-10-29' });
    expect(next.activeDay).to.equal('2026-10-29');
  });

  it('SET_SEARCH changes searchQuery', () => {
    const next = reducer(baseState, { type: 'SET_SEARCH', query: 'typography' });
    expect(next.searchQuery).to.equal('typography');
  });

  it('SET_MY_TAB changes mySessionsTab', () => {
    const next = reducer(baseState, { type: 'SET_MY_TAB', tab: 'on-demand' });
    expect(next.mySessionsTab).to.equal('on-demand');
  });

  it('IMS_UPDATE sets auth state', () => {
    const next = reducer(baseState, {
      type: 'IMS_UPDATE',
      isLoggedIn: true,
      isRegistered: true,
      userFirstName: 'Daniel',
    });
    expect(next.isLoggedIn).to.be.true;
    expect(next.isRegistered).to.be.true;
    expect(next.userFirstName).to.equal('Daniel');
  });

  it('IMS_UPDATE preserves existing userFirstName when not provided', () => {
    const withName = reducer(baseState, {
      type: 'IMS_UPDATE', isLoggedIn: true, isRegistered: false, userFirstName: 'Daniel',
    });
    const next = reducer(withName, {
      type: 'IMS_UPDATE', isLoggedIn: true, isRegistered: true,
    });
    expect(next.userFirstName).to.equal('Daniel');
  });

  it('LIVE_STATUS_UPDATE replaces liveStreamActiveIds', () => {
    const active = new Set(['mr-123']);
    const next = reducer(baseState, { type: 'LIVE_STATUS_UPDATE', active, inactive: new Set() });
    expect(next.liveStreamActiveIds.has('mr-123')).to.be.true;
  });

  it('unknown action returns state unchanged', () => {
    const next = reducer(baseState, { type: 'UNKNOWN_ACTION' });
    expect(next).to.equal(baseState);
  });

  it('SESSIONS_LOADED sets sessions, derives eventDays, and marks status ready', () => {
    const newSession = { id: 'new-session', startTimeUtc: '2026-11-10T17:00:00.000Z' };
    const next = reducer(baseState, { type: 'SESSIONS_LOADED', sessions: [newSession] });
    expect(next.sessions).to.deep.equal([newSession]);
    expect(next.sessionsStatus).to.equal('ready');
    expect(next.eventDays).to.deep.equal(['2026-11-10']);
  });

  it('SET_SESSIONS_STATUS changes sessionsStatus', () => {
    const next = reducer(baseState, { type: 'SET_SESSIONS_STATUS', status: 'error' });
    expect(next.sessionsStatus).to.equal('error');
  });

  it('SET_DRAWER changes drawerState', () => {
    const next = reducer(baseState, { type: 'SET_DRAWER', drawer: 'peek' });
    expect(next.drawerState).to.equal('peek');
  });
});
