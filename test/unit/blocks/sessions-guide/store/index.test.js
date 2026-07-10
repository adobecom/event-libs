import { expect } from '@esm-bundle/chai';
import { buildInitialState, reducer } from '../../../../../event-libs/v1/blocks/sessions-guide/store/index.js';
import { auth } from '../../../../../event-libs/v1/utils/session-store.js';

const MOCK_CONFIG = {
  title: 'Adobe MAX 2026',
  userTz: 'America/Los_Angeles',
  showConflictModal: true,
  filterCategories: [],
  trackIcons: {},
  trackColors: {},
  theme: 'dark',
};

describe('store/buildInitialState', () => {
  beforeEach(() => {
    sessionStorage.removeItem('sg:last-view');
    auth.value = { isLoggedIn: null, isRegistered: undefined, userFirstName: null };
  });

  it('sets activeView to live-upcoming when not registered', () => {
    const state = buildInitialState(MOCK_CONFIG);
    expect(state.activeView).to.equal('live-upcoming');
  });

  it('sets activeView to my-sessions when already registered', () => {
    auth.value = { isLoggedIn: true, isRegistered: true, userFirstName: 'Daniel' };
    const state = buildInitialState(MOCK_CONFIG);
    expect(state.activeView).to.equal('my-sessions');
  });

  it('initializes eventDays and activeDay as empty (populated later from shared session data)', () => {
    const state = buildInitialState(MOCK_CONFIG);
    expect(state.eventDays).to.deep.equal([]);
    expect(state.activeDay).to.equal('');
  });

  it('sets drawerState to hidden', () => {
    const state = buildInitialState(MOCK_CONFIG);
    expect(state.drawerState).to.equal('hidden');
  });

  it('carries eventConfig through', () => {
    const state = buildInitialState(MOCK_CONFIG);
    expect(state.eventConfig).to.deep.equal(MOCK_CONFIG);
  });
});

describe('store/reducer', () => {
  let baseState;

  beforeEach(() => {
    sessionStorage.removeItem('sg:last-view');
    auth.value = { isLoggedIn: null, isRegistered: undefined, userFirstName: null };
    baseState = buildInitialState(MOCK_CONFIG);
  });

  it('SET_EVENT_DAYS sets eventDays and picks a default activeDay', () => {
    const next = reducer(baseState, { type: 'SET_EVENT_DAYS', eventDays: ['2026-10-28', '2026-10-29'] });
    expect(next.eventDays).to.deep.equal(['2026-10-28', '2026-10-29']);
    expect(next.activeDay).to.not.equal('');
  });

  it('SET_EVENT_DAYS keeps the current activeDay when it is still valid', () => {
    const withDays = reducer(baseState, { type: 'SET_EVENT_DAYS', eventDays: ['2026-10-28', '2026-10-29'] });
    const withDay = reducer(withDays, { type: 'SET_DAY', day: '2026-10-29' });
    const next = reducer(withDay, { type: 'SET_EVENT_DAYS', eventDays: ['2026-10-28', '2026-10-29'] });
    expect(next.activeDay).to.equal('2026-10-29');
  });

  it('SET_EVENT_DAYS resets activeDay when it is no longer in the list', () => {
    const withDays = reducer(baseState, { type: 'SET_EVENT_DAYS', eventDays: ['2026-10-28'] });
    const withDay = reducer(withDays, { type: 'SET_DAY', day: '2026-10-28' });
    const next = reducer(withDay, { type: 'SET_EVENT_DAYS', eventDays: ['2026-11-10'] });
    expect(next.activeDay).to.equal('2026-11-10');
  });

  it('SET_VIEW changes activeView', () => {
    const next = reducer(baseState, { type: 'SET_VIEW', view: 'on-demand' });
    expect(next.activeView).to.equal('on-demand');
  });

  it('SET_DAY changes activeDay', () => {
    const next = reducer(baseState, { type: 'SET_DAY', day: '2026-10-29' });
    expect(next.activeDay).to.equal('2026-10-29');
  });

  it('SET_FILTERS changes activeFilters', () => {
    const filters = { track: new Set(['design']) };
    const next = reducer(baseState, { type: 'SET_FILTERS', filters });
    expect(next.activeFilters).to.equal(filters);
  });

  it('SET_SEARCH changes searchQuery', () => {
    const next = reducer(baseState, { type: 'SET_SEARCH', query: 'typography' });
    expect(next.searchQuery).to.equal('typography');
  });

  it('SET_MY_TAB changes mySessionsTab', () => {
    const next = reducer(baseState, { type: 'SET_MY_TAB', tab: 'on-demand' });
    expect(next.mySessionsTab).to.equal('on-demand');
  });

  it('SET_MY_FAVORITES_TAB changes myFavoritesTab', () => {
    const next = reducer(baseState, { type: 'SET_MY_FAVORITES_TAB', tab: 'on-demand' });
    expect(next.myFavoritesTab).to.equal('on-demand');
  });

  it('unknown action returns state unchanged', () => {
    const next = reducer(baseState, { type: 'UNKNOWN_ACTION' });
    expect(next).to.equal(baseState);
  });

  it('SET_DRAWER changes drawerState', () => {
    const next = reducer(baseState, { type: 'SET_DRAWER', drawer: 'peek' });
    expect(next.drawerState).to.equal('peek');
  });

  it('SET_DRAWER falls back to the caller-provided defaultView when opening fresh', () => {
    const next = reducer(baseState, { type: 'SET_DRAWER', drawer: 'peek', defaultView: 'my-sessions' });
    expect(next.activeView).to.equal('my-sessions');
  });

  it('CLOSE_DRAWER hides drawer and clears activeSessionId', () => {
    const withSession = reducer(baseState, { type: 'SET_ACTIVE_SESSION', sessionId: 'session-1' });
    const next = reducer(withSession, { type: 'CLOSE_DRAWER' });
    expect(next.drawerState).to.equal('hidden');
    expect(next.activeSessionId).to.be.null;
  });

  it('ADD_DISMISSING_ID / REMOVE_DISMISSING_ID', () => {
    const added = reducer(baseState, { type: 'ADD_DISMISSING_ID', id: 'session-1' });
    expect(added.dismissingIds.has('session-1')).to.be.true;
    const removed = reducer(added, { type: 'REMOVE_DISMISSING_ID', id: 'session-1' });
    expect(removed.dismissingIds.has('session-1')).to.be.false;
  });
});
