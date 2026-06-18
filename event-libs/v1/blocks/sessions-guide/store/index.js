import {
  createContext, useReducer, useEffect, useContext, h,
} from '../../../deps/htm-preact.js';
import { injectDispatch, startPolling, stopPolling } from '../services/poller.js';
import { fetchSessions } from '../services/sessions-api.js';
import { getNowMs, getSessionDayKey } from '../utils/time.js';
import { deriveSessionState } from '../utils/session-state.js';

function deriveEventDays(sessions, userTz) {
  const tz = userTz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const daySet = new Set();
  sessions.forEach((s) => { if (s.startTimeUtc) daySet.add(getSessionDayKey(s, tz)); });
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

export function buildInitialState(eventConfig, initialSessions = []) {
  const userTz = eventConfig && eventConfig.userTz;
  const eventDays = deriveEventDays(initialSessions, userTz);
  return {
    sessions: initialSessions,
    sessionsStatus: initialSessions.length > 0 ? 'ready' : 'loading',
    drawerState: 'hidden',
    scheduled: new Set(),
    favorited: new Set(),
    liveStreamActiveIds: new Set(),
    activeView: 'live-upcoming',
    eventDays,
    activeDay: getDefaultDay(eventDays, userTz),
    activeFilters: {},
    searchQuery: '',
    mySessionsTab: 'upcoming',
    isLoggedIn: null,
    isRegistered: undefined,
    userFirstName: null,
    eventConfig: eventConfig || {},
    activeSessionId: null,
    toast: null,
    pendingActions: new Set(),
    regPromptOpen: false,
    conflictModal: null,
  };
}

export function reducer(state, action) {
  switch (action.type) {
    case 'INIT_USER_DATA': {
      return {
        ...state,
        scheduled: action.scheduled instanceof Set ? action.scheduled : new Set(action.scheduled),
        favorited: action.favorited instanceof Set ? action.favorited : new Set(action.favorited),
      };
    }

    case 'LIVE_STATUS_UPDATE': {
      const next = { ...state, liveStreamActiveIds: action.active };
      const now = action.now || getNowMs();

      const manualCutoff = state.eventConfig.manualOnDemandTransitionTime
        ? Date.parse(state.eventConfig.manualOnDemandTransitionTime)
        : null;
      const pastManualCutoff = manualCutoff !== null && now >= manualCutoff;

      const allEnded = state.sessions.length > 0 && state.sessions.every(
        (s) => deriveSessionState(s, action.active, now) === 'on-demand',
      );

      if ((allEnded || pastManualCutoff) && next.activeView === 'live-upcoming') {
        next.activeView = 'on-demand';
      }

      return next;
    }

    case 'SCHEDULE_ADD': {
      const scheduled = new Set(state.scheduled);
      scheduled.add(action.sessionId);
      return { ...state, scheduled };
    }
    case 'SCHEDULE_REMOVE': {
      const scheduled = new Set(state.scheduled);
      scheduled.delete(action.sessionId);
      return { ...state, scheduled };
    }
    case 'FAVORITE_ADD': {
      const favorited = new Set(state.favorited);
      favorited.add(action.sessionId);
      return { ...state, favorited };
    }
    case 'FAVORITE_REMOVE': {
      const favorited = new Set(state.favorited);
      favorited.delete(action.sessionId);
      return { ...state, favorited };
    }

    case 'SET_VIEW':
      return { ...state, activeView: action.view };
    case 'SET_DAY':
      return { ...state, activeDay: action.day };
    case 'SET_FILTERS':
      return { ...state, activeFilters: action.filters };
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.query };
    case 'SET_MY_TAB':
      return { ...state, mySessionsTab: action.tab };
    case 'IMS_UPDATE':
      return {
        ...state,
        isLoggedIn: action.isLoggedIn,
        isRegistered: action.isRegistered,
        userFirstName: action.userFirstName ?? state.userFirstName,
      };

    case 'SESSIONS_LOADED': {
      const userTz = state.eventConfig && state.eventConfig.userTz;
      const eventDays = deriveEventDays(action.sessions, userTz);
      const activeDay = eventDays.includes(state.activeDay)
        ? state.activeDay
        : getDefaultDay(eventDays, userTz);
      return {
        ...state, sessions: action.sessions, sessionsStatus: 'ready', eventDays, activeDay,
      };
    }
    case 'SET_SESSIONS_STATUS':
      return { ...state, sessionsStatus: action.status };
    case 'SET_DRAWER':
      return { ...state, drawerState: action.drawer };

    case 'SET_ACTIVE_SESSION':
      return { ...state, activeSessionId: action.sessionId };

    case 'SHOW_TOAST':
      return {
        ...state,
        toast: {
          id: Date.now(),
          message: action.message,
          variant: action.variant || 'neutral',
          ctaLabel: action.ctaLabel || null,
          ctaAction: action.ctaAction || null,
          ctaHref: action.ctaHref || null,
          duration: action.duration !== undefined ? action.duration : 1500,
        },
      };
    case 'HIDE_TOAST':
      return { ...state, toast: null };

    case 'SET_PENDING': {
      const pendingActions = new Set(state.pendingActions);
      if (action.pending) pendingActions.add(action.sessionId);
      else pendingActions.delete(action.sessionId);
      return { ...state, pendingActions };
    }

    case 'SHOW_REG_PROMPT':
      return { ...state, regPromptOpen: true };
    case 'HIDE_REG_PROMPT':
      return { ...state, regPromptOpen: false };

    case 'SHOW_CONFLICT':
      return { ...state, conflictModal: action.conflict };
    case 'HIDE_CONFLICT':
      return { ...state, conflictModal: null };

    default:
      return state;
  }
}

export const SessionGuideContext = createContext(null);

export function SessionGuideProvider({ eventConfig, initialSessions = [], children }) {
  const [state, dispatch] = useReducer(reducer, buildInitialState(eventConfig, initialSessions));

  useEffect(() => {
    if (initialSessions.length > 0) return;
    const apiUrl = eventConfig && eventConfig.rfApiUrl;
    fetchSessions(apiUrl)
      .then((sessions) => {
        dispatch({ type: 'SESSIONS_LOADED', sessions });
      })
      .catch((err) => {
        window.lana?.log(`[sessions-guide] sessions fetch failed: ${err.message}`);
        dispatch({ type: 'SET_SESSIONS_STATUS', status: 'error' });
      });
  }, []);

  useEffect(() => {
    if (state.sessionsStatus !== 'ready') return undefined;
    injectDispatch(dispatch);
    const mrSessions = state.sessions.filter((s) => s.mrStreamId);
    const timerId = startPolling(mrSessions, eventConfig.mrEnv);
    return () => {
      stopPolling();
      if (timerId) clearInterval(timerId);
    };
  }, [state.sessionsStatus]);

  // App is invoked directly via children() (appFactory), not through Preact's reconciler,
  // so _current is the only way useContext returns the right value in that direct call.
  SessionGuideContext._current = { state, dispatch };
  const resolved = typeof children === 'function' ? children() : children;
  return h(SessionGuideContext.Provider, { value: { state, dispatch } }, resolved);
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
