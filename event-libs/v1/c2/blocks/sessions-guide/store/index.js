import {
  createContext, useReducer, useContext, useEffect, h,
} from '../../../../deps/htm-preact.js';
import {
  sessions, sessionsStatus, liveStreamActiveIds, auth, getEventApiConfig, sessionStateVersion,
} from '../../../../utils/session-store.js';
import { isPostEvent } from '../../../../utils/session-state.js';
import { getNowMs, getSessionDayKey } from '../utils/time.js';

const SS_LAST_VIEW = 'sg:last-view';

function deriveEventDays(sessionList, userTz) {
  const tz = userTz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const daySet = new Set();
  sessionList.forEach((s) => { if (s.startTimeUtc) daySet.add(getSessionDayKey(s, tz)); });
  return [...daySet].sort();
}

function getDefaultDay(eventDays, userTz) {
  if (!eventDays || !eventDays.length) return '';
  const tz = userTz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(getNowMs()));
  if (eventDays.includes(today)) return today;
  if (today < eventDays[0]) return eventDays[0];
  return eventDays[eventDays.length - 1];
}

// UI-only state for this block's own widget chrome — cross-block data (sessions,
// favorited, scheduled, auth) lives in event-libs/v1/utils/session-store.js instead.
// Named guideConfig (not eventConfig) to stay distinct from utils.js's page-wide
// getEventConfig() and the Tier 1 Event Configurator's tier-1-event-config.js —
// this is sessions-guide's own block-level authoring config (see parse-config.js).
export function buildInitialState(guideConfig) {
  return {
    drawerState: 'hidden',
    activeView: auth.value.isRegistered ? 'my-sessions' : 'live-upcoming',
    eventDays: [],
    activeDay: '',
    activeFilters: {},
    searchQuery: '',
    mySessionsTab: 'upcoming',
    myFavoritesTab: 'upcoming',
    guideConfig: guideConfig || {},
    activeSessionId: null,
    dismissingIds: new Set(),
  };
}

export function reducer(state, action) {
  switch (action.type) {
    case 'SET_EVENT_DAYS': {
      const activeDay = action.eventDays.includes(state.activeDay)
        ? state.activeDay
        : getDefaultDay(action.eventDays, state.guideConfig.userTz);
      return { ...state, eventDays: action.eventDays, activeDay };
    }

    case 'SET_VIEW': {
      try { sessionStorage.setItem(SS_LAST_VIEW, action.view); } catch { /* unavailable */ }
      return { ...state, activeView: action.view };
    }
    case 'SET_DAY':
      return { ...state, activeDay: action.day };
    case 'SET_FILTERS':
      return { ...state, activeFilters: action.filters };
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.query };
    case 'SET_MY_TAB':
      return { ...state, mySessionsTab: action.tab };
    case 'SET_MY_FAVORITES_TAB':
      return { ...state, myFavoritesTab: action.tab };

    case 'SET_DRAWER': {
      const next = { ...state, drawerState: action.drawer };
      if (action.drawer !== 'hidden' && state.drawerState === 'hidden') {
        // Restore the last view the user was on; fall back to auth-appropriate default
        // (computed by the caller, which can read the shared auth signal).
        let lastView = null;
        try { lastView = sessionStorage.getItem(SS_LAST_VIEW); } catch { /* unavailable */ }
        next.activeView = lastView || action.defaultView || state.activeView;
      }
      return next;
    }

    case 'CLOSE_DRAWER':
      return { ...state, drawerState: 'hidden', activeSessionId: null };

    case 'SET_ACTIVE_SESSION':
      return { ...state, activeSessionId: action.sessionId };

    case 'ADD_DISMISSING_ID':
      return { ...state, dismissingIds: new Set([...state.dismissingIds, action.id]) };
    case 'REMOVE_DISMISSING_ID': {
      const next = new Set(state.dismissingIds);
      next.delete(action.id);
      return { ...state, dismissingIds: next };
    }

    default:
      return state;
  }
}

export const SessionGuideContext = createContext(null);

export function SessionGuideProvider({ guideConfig, children }) {
  const [state, dispatch] = useReducer(reducer, buildInitialState(guideConfig));

  // Recompute the day-tab list whenever the shared sessions data changes.
  useEffect(() => {
    function recomputeDays() {
      dispatch({ type: 'SET_EVENT_DAYS', eventDays: deriveEventDays(sessions.value, guideConfig.userTz) });
    }
    recomputeDays();
    return sessions.subscribe(recomputeDays);
  }, []);

  // Auto-switch out of "live-upcoming" once every session has gone on-demand, or once
  // the Tier 1 Event Configurator's authored eventEndDateTime has passed — whichever
  // comes first.
  useEffect(() => {
    function checkAutoTransition() {
      if (state.activeView !== 'live-upcoming') return;
      if (sessionsStatus.value !== 'ready' || !sessions.value.length) return;
      const eventEndMs = getEventApiConfig()?.eventEndMs;
      if (isPostEvent(sessions.value, liveStreamActiveIds.value, getNowMs(), eventEndMs)) {
        dispatch({ type: 'SET_VIEW', view: 'on-demand' });
      }
    }
    checkAutoTransition();
    const unsubSessions = sessions.subscribe(checkAutoTransition);
    const unsubLive = liveStreamActiveIds.subscribe(checkAutoTransition);
    // Catches the case where time alone crosses allEnded/pastManualCutoff, with no
    // accompanying sessions/liveStreamActiveIds write (e.g. an event with no MR sessions).
    const unsubVersion = sessionStateVersion.subscribe(checkAutoTransition);
    return () => { unsubSessions(); unsubLive(); unsubVersion(); };
  }, [state.activeView]);

  return h(SessionGuideContext.Provider, { value: { state, dispatch } }, children);
}

export function useSessionGuide() {
  return useContext(SessionGuideContext);
}

// Compatibility shim for tests — returns a store-like object whose
// SessionGuideContext IS the module-level context, so tests can inject
// state via store.SessionGuideContext._current and the static-import
// components will pick it up via useSessionGuide().
export function buildStore() {
  return { SessionGuideContext, useSessionGuide };
}
