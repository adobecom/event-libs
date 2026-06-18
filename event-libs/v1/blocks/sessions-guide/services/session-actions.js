import { addSession, removeSession, toggleSessionInterest } from './rainfocus.js';

export function hasTimeConflict(a, b) {
  const aStart = Date.parse(a.startTimeUtc);
  const aEnd = Date.parse(a.endTimeUtc);
  const bStart = Date.parse(b.startTimeUtc);
  const bEnd = Date.parse(b.endTimeUtc);
  return aStart < bEnd && aEnd > bStart;
}

function findScheduleConflict(incoming, sessions, scheduled) {
  return sessions.find(
    (s) => s.id !== incoming.id && scheduled.has(s.id) && hasTimeConflict(s, incoming),
  ) || null;
}

function showAuthToast(action, state, dispatch) {
  const { isLoggedIn, isRegistered, eventConfig } = state;
  const { title: eventTitle, registerUrl } = eventConfig;

  if (isLoggedIn !== true) {
    dispatch({
      type: 'SHOW_TOAST',
      message: `Login required to ${action}`,
      variant: 'informative',
      ctaLabel: 'Login to Adobe',
      ctaAction: () => window.adobeIMS?.signIn(),
      duration: null,
    });
    return true;
  }
  if (isRegistered !== true) {
    const eventName = eventTitle ? ` for ${eventTitle}` : '';
    dispatch({
      type: 'SHOW_TOAST',
      message: `Registration${eventName} required to ${action}`,
      variant: 'informative',
      ctaLabel: 'Register',
      ctaHref: registerUrl || '/register',
      duration: null,
    });
    return true;
  }
  return false;
}

export async function scheduleAction(session, state, dispatch) {
  const { scheduled, sessions = [], pendingActions = new Set(), eventConfig } = state;
  const { rfApiProfileId, rfApiUrl, showConflictModal } = eventConfig;
  const isScheduled = scheduled.has(session.id);
  const isPending = pendingActions.has(session.id);

  if (showAuthToast('add to schedule', state, dispatch)) return;
  if (isPending) return;

  dispatch({ type: 'SET_PENDING', sessionId: session.id, pending: true });
  try {
    if (isScheduled) {
      // TODO: replace null credentials with real rfAuthToken/clientId from auth integration
      await removeSession(session.rfCode, null, null, rfApiProfileId, rfApiUrl);
      dispatch({ type: 'SCHEDULE_REMOVE', sessionId: session.id });
      dispatch({ type: 'SHOW_TOAST', message: 'Removed from schedule', variant: 'neutral' });
    } else {
      if (showConflictModal) {
        const conflict = findScheduleConflict(session, sessions, scheduled);
        if (conflict) {
          dispatch({
            type: 'SHOW_CONFLICT',
            conflict: {
              existing: conflict,
              incoming: session,
              onConfirm: async (keep) => {
                if (keep.id === session.id) {
                  await removeSession(conflict.rfCode, null, null, rfApiProfileId, rfApiUrl);
                  dispatch({ type: 'SCHEDULE_REMOVE', sessionId: conflict.id });
                  await addSession(session.rfCode, null, null, rfApiProfileId, rfApiUrl);
                  dispatch({ type: 'SCHEDULE_ADD', sessionId: session.id });
                }
                dispatch({ type: 'SHOW_TOAST', message: 'Schedule updated', variant: 'positive' });
              },
            },
          });
          dispatch({ type: 'SET_PENDING', sessionId: session.id, pending: false });
          return;
        }
      }
      await addSession(session.rfCode, null, null, rfApiProfileId, rfApiUrl);
      dispatch({ type: 'SCHEDULE_ADD', sessionId: session.id });
      dispatch({ type: 'SHOW_TOAST', message: 'Added to schedule', variant: 'positive' });
    }
  } catch (err) {
    window.lana?.log(`[sessions-guide] schedule action failed: ${err.message}`);
    dispatch({ type: 'SHOW_TOAST', message: 'Something went wrong. Please try again.', variant: 'negative' });
  } finally {
    dispatch({ type: 'SET_PENDING', sessionId: session.id, pending: false });
  }
}

export async function favoriteAction(session, state, dispatch) {
  const { favorited, pendingActions = new Set(), eventConfig } = state;
  const { rfApiProfileId, rfApiUrl } = eventConfig;
  const isFavorited = favorited.has(session.id);
  const isPending = pendingActions.has(session.id);

  if (showAuthToast('add to favorites', state, dispatch)) return;
  if (isPending) return;

  dispatch({ type: 'SET_PENDING', sessionId: session.id, pending: true });
  try {
    // TODO: replace null credentials with real rfAuthToken/clientId from auth integration
    await toggleSessionInterest(session.rfCode, session.id, null, null, rfApiProfileId, rfApiUrl);
    dispatch({ type: isFavorited ? 'FAVORITE_REMOVE' : 'FAVORITE_ADD', sessionId: session.id });
    dispatch({
      type: 'SHOW_TOAST',
      message: isFavorited ? 'Removed from favorites' : 'Added to favorites',
      variant: isFavorited ? 'neutral' : 'positive',
    });
  } catch (err) {
    window.lana?.log(`[sessions-guide] favorite action failed: ${err.message}`);
    dispatch({ type: 'SHOW_TOAST', message: 'Something went wrong. Please try again.', variant: 'negative' });
  } finally {
    dispatch({ type: 'SET_PENDING', sessionId: session.id, pending: false });
  }
}
