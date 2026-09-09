import {
  resolveScheduleConflict, toggleScheduleAction, toggleFavoriteAction, assertAuthorized,
} from './session-actions.js';
import { showToast } from '../../features/toast/toast.js';
import { showConflictModal } from '../../features/conflict-modal/conflict-modal.js';
import { getAllowDoubleBooking } from '../../utils/tier-1-event-config.js';
import {
  sessions, sessionsStatus, liveStreamActiveIds, getEventApiConfig,
} from '../../utils/session-store.js';
import { getNowMs, isPostEvent } from '../../utils/session-state.js';

// Shared toast copy for gated actions, used by both runSessionAction's failures and checkViewAccess.
export function showAuthToast({ eventConfig, actionLabel }) {
  showToast({
    message: `Register or sign in to ${actionLabel}.`,
    variant: 'informative',
    ctaLabel: 'Register/Sign in',
    ctaHref: eventConfig.registerUrl || '/register',
    // Caps at one toast per gated action; actionLabel is already the natural per-action key.
    key: actionLabel,
  });
}

// Translates a SessionActionError into a toast or conflict modal — usable by both Preact and vanilla blocks.
export async function runSessionAction(actionFn, {
  eventConfig, actionLabel, successMessage, successVariant = 'positive', onBlocked,
}) {
  try {
    await actionFn();
    if (successMessage) showToast({ message: successMessage, variant: successVariant });
  } catch (err) {
    if (err.reason === 'auth-required' || err.reason === 'registration-required') {
      showAuthToast({ eventConfig, actionLabel });
      // Blurs the triggering button so a hover-styled card doesn't look stuck via :focus-within.
      onBlocked?.();
    } else if (err.reason === 'conflict') {
      const { conflict, incoming } = err.meta;
      showConflictModal({
        existing: conflict,
        incoming,
        onConfirm: async (keep) => {
          if (keep.id === incoming.id) {
            await resolveScheduleConflict(conflict, incoming);
            showToast({ message: 'Schedule updated', variant: 'positive' });
          }
        },
      }).catch((modalErr) => {
        window.lana?.log(`[sessions-guide] ${actionLabel} conflict modal failed: ${modalErr.message}`);
      });
    } else {
      window.lana?.log(`[sessions-guide] ${actionLabel} failed: ${err.message}`);
      showToast({ message: 'Something went wrong. Please try again.', variant: 'negative' });
    }
  }
}

// Thin, pre-labeled wrappers so every schedule/favorite call site shares the same success copy.
export function toggleScheduleWithFeedback(session, {
  eventConfig, isScheduled, onBlocked,
}) {
  // Inverted: allowing double booking means suppressing the conflict modal.
  return runSessionAction(
    () => toggleScheduleAction(session, { showConflictModal: !getAllowDoubleBooking() }),
    {
      eventConfig,
      actionLabel: 'add to your schedule',
      successMessage: isScheduled ? 'Removed from schedule' : 'Added to schedule',
      successVariant: isScheduled ? 'neutral' : 'positive',
      onBlocked,
    },
  );
}

export function toggleFavoriteWithFeedback(session, {
  eventConfig, isFavorited, onBlocked,
}) {
  return runSessionAction(
    () => toggleFavoriteAction(session),
    {
      eventConfig,
      actionLabel: 'favorite',
      successMessage: isFavorited ? 'Removed from favorites' : 'Added to favorites',
      successVariant: isFavorited ? 'neutral' : 'positive',
      onBlocked,
    },
  );
}

// Lowercase mid-sentence: only used inside toast copy, never as a standalone label.
const GATED_VIEW_LABELS = { 'my-sessions': 'my sessions', 'my-favorites': 'my favorites' };

// Where an unauthorized visitor lands: Live & upcoming during the event, On demand once isPostEvent().
function fallbackViewForUnauthorized() {
  if (sessionsStatus.value !== 'ready' || !sessions.value.length) return 'live-upcoming';
  const eventEndMs = getEventApiConfig()?.eventEndMs;
  return isPostEvent(sessions.value, liveStreamActiveIds.value, getNowMs(), eventEndMs)
    ? 'on-demand'
    : 'live-upcoming';
}

// isRegistered stays `undefined` until session-store.js settles it (possibly to `null` on failure) —
// resolving here too early would bounce an about-to-be-confirmed visitor away.
export function isAuthResolved({ isLoggedIn, isRegistered }) {
  return isLoggedIn === false || (isLoggedIn === true && isRegistered !== undefined);
}

// Returns the fallback view when blocked (toast already shown), or null when accessible.
export function checkViewAccess(view, { eventConfig }) {
  const label = GATED_VIEW_LABELS[view];
  if (!label) return null;
  try {
    assertAuthorized();
    return null;
  } catch {
    showAuthToast({ eventConfig, actionLabel: `view ${label}` });
    return fallbackViewForUnauthorized();
  }
}
