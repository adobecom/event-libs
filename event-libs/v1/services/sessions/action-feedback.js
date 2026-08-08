import {
  resolveScheduleConflict, scheduleAction, favoriteAction, assertAuthorized,
} from './session-actions.js';
import { showToast } from '../../features/toast/toast.js';
import { showConflictModal } from '../../features/conflict-modal/conflict-modal.js';
import { getAllowDoubleBooking } from '../../utils/tier-1-event-config.js';
import {
  sessions, sessionsStatus, liveStreamActiveIds, getApiConfig,
} from '../../utils/session-store.js';
import { getNowMs, isPostEvent } from '../../utils/session-state.js';

// Shared toast copy for the two auth-related SessionActionError reasons — used both by
// runSessionAction's action failures and checkViewAccess's navigation gate, so login/
// registration toasts read consistently everywhere they appear.
function showAuthToast(reason, { eventConfig, actionLabel }) {
  if (reason === 'auth-required') {
    showToast({
      message: `Login required to ${actionLabel}`,
      variant: 'informative',
      ctaLabel: 'Login to Adobe',
      ctaAction: () => window.adobeIMS?.signIn(),
      duration: null,
    });
  } else if (reason === 'registration-required') {
    const eventName = eventConfig.title ? ` for ${eventConfig.title}` : '';
    showToast({
      message: `Registration${eventName} required to ${actionLabel}`,
      variant: 'informative',
      ctaLabel: 'Register',
      ctaHref: eventConfig.registerUrl,
      duration: null,
    });
  }
}

// Translates a SessionActionError (thrown by the shared, UI-agnostic session-actions
// layer) into a toast or conflict modal via the shared, page-level modules — usable by
// both Preact and vanilla blocks.
export async function runSessionAction(actionFn, {
  eventConfig, actionLabel, successMessage, successVariant = 'positive',
}) {
  try {
    await actionFn();
    if (successMessage) showToast({ message: successMessage, variant: successVariant });
  } catch (err) {
    if (err.reason === 'auth-required' || err.reason === 'registration-required') {
      showAuthToast(err.reason, { eventConfig, actionLabel });
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
export function scheduleWithFeedback(session, { eventConfig, isScheduled }) {
  // One shared, page-level read (not eventConfig, which is per-block) — inverted,
  // since allowing double booking means suppressing the conflict modal.
  return runSessionAction(
    () => scheduleAction(session, { showConflictModal: !getAllowDoubleBooking() }),
    {
      eventConfig,
      actionLabel: 'add to schedule',
      successMessage: isScheduled ? 'Removed from schedule' : 'Added to schedule',
      successVariant: isScheduled ? 'neutral' : 'positive',
    },
  );
}

export function favoriteWithFeedback(session, { eventConfig, isFavorited }) {
  return runSessionAction(
    () => favoriteAction(session),
    {
      eventConfig,
      actionLabel: 'add to favorites',
      successMessage: isFavorited ? 'Removed from favorites' : 'Added to favorites',
      successVariant: isFavorited ? 'neutral' : 'positive',
    },
  );
}

const GATED_VIEW_LABELS = { 'my-sessions': 'My sessions', 'my-favorites': 'My favorites' };

// Where an unauthorized visitor should land instead of a gated view — Live & upcoming
// during the event, On demand once isPostEvent() (shared with the auto-transition below).
function fallbackViewForUnauthorized() {
  if (sessionsStatus.value !== 'ready' || !sessions.value.length) return 'live-upcoming';
  const manualCutoff = getApiConfig()?.manualCutoff;
  return isPostEvent(sessions.value, liveStreamActiveIds.value, getNowMs(), manualCutoff)
    ? 'on-demand'
    : 'live-upcoming';
}

// Gates navigation to My Sessions/My Favorites, reusing the same login/registration toast
// as the schedule/favorite actions. Returns the fallback view when blocked (toast already
// shown), or null when accessible/ungated. Called from ViewDropdown's click handler and
// reactively from MySessionsView/MyFavoritesView, covering every way a visitor can land on
// these views.
export function checkViewAccess(view, { eventConfig }) {
  const label = GATED_VIEW_LABELS[view];
  if (!label) return null;
  try {
    assertAuthorized();
    return null;
  } catch (err) {
    showAuthToast(err.reason, { eventConfig, actionLabel: `view ${label}` });
    return fallbackViewForUnauthorized();
  }
}
