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

// Shared toast copy for gated actions — used both by runSessionAction's action failures
// and checkViewAccess's navigation gate. Login and registration are treated as a single
// pool now (no more auth-required vs registration-required distinction in the copy), so
// every gated action gets the same message/CTA, always pointing at the registration link.
export function showAuthToast({ eventConfig, actionLabel }) {
  showToast({
    message: `Register or sign in to ${actionLabel}.`,
    variant: 'informative',
    ctaLabel: 'Register/Sign in',
    ctaHref: eventConfig.registerUrl || '/register',
    // Caps at one toast per gated action (view my sessions / view my favorites / favorite /
    // add to your schedule) -- actionLabel is already the natural per-action key.
    key: actionLabel,
  });
}

// Translates a SessionActionError (thrown by the shared, UI-agnostic session-actions
// layer) into a toast or conflict modal via the shared, page-level modules — usable by
// both Preact and vanilla blocks.
export async function runSessionAction(actionFn, {
  eventConfig, actionLabel, successMessage, successVariant = 'positive', onBlocked,
}) {
  try {
    await actionFn();
    if (successMessage) showToast({ message: successMessage, variant: successVariant });
  } catch (err) {
    if (err.reason === 'auth-required' || err.reason === 'registration-required') {
      showAuthToast({ eventConfig, actionLabel });
      // The triggering button still has native focus, which keeps a hover-styled card
      // looking "stuck" via :focus-within long after the pointer has moved away —
      // give the caller a chance to blur it now that the action didn't go through.
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

// Thin, pre-labeled wrappers around runSessionAction so every schedule/favorite call
// site shares the same success copy instead of repeating it at each call site.
export function toggleScheduleWithFeedback(session, {
  eventConfig, isScheduled, onBlocked,
}) {
  // One shared, page-level read (not eventConfig, which is per-block) — inverted,
  // since allowing double booking means suppressing the conflict modal.
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

// Lowercase mid-sentence -- these only ever appear inside the toast copy ("...to view my
// sessions."), never as a standalone label (ViewDropdown.js keeps its own Title Case copy).
const GATED_VIEW_LABELS = { 'my-sessions': 'my sessions', 'my-favorites': 'my favorites' };

// Where an unauthorized visitor should land instead of a gated view — Live & upcoming
// during the event, On demand once isPostEvent() (shared with the auto-transition below).
function fallbackViewForUnauthorized() {
  if (sessionsStatus.value !== 'ready' || !sessions.value.length) return 'live-upcoming';
  const eventEndMs = getEventApiConfig()?.eventEndMs;
  return isPostEvent(sessions.value, liveStreamActiveIds.value, getNowMs(), eventEndMs)
    ? 'on-demand'
    : 'live-upcoming';
}

// Gates navigation to My Sessions/My Favorites, reusing the schedule/favorite actions'
// login/registration toast. Returns the fallback view when blocked (toast already shown),
// or null when accessible.
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
