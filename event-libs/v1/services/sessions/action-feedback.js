import { resolveScheduleConflict, scheduleAction, favoriteAction } from './session-actions.js';
import { showToast } from '../../features/toast/toast.js';
import { showConflictModal } from '../../features/conflict-modal/conflict-modal.js';

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
    if (err.reason === 'auth-required') {
      showToast({
        message: `Login required to ${actionLabel}`,
        variant: 'informative',
        ctaLabel: 'Login to Adobe',
        ctaAction: () => window.adobeIMS?.signIn(),
        duration: null,
      });
    } else if (err.reason === 'registration-required') {
      const eventName = eventConfig.title ? ` for ${eventConfig.title}` : '';
      showToast({
        message: `Registration${eventName} required to ${actionLabel}`,
        variant: 'informative',
        ctaLabel: 'Register',
        ctaHref: eventConfig.registerUrl,
        duration: null,
      });
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
  return runSessionAction(
    () => scheduleAction(session, { showConflictModal: eventConfig.showConflictModal }),
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
