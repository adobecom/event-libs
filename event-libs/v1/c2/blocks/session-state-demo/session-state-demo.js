import { createTag } from '../../../utils/utils.js';
import {
  sessions, sessionsStatus, favorited, scheduled, auth, pendingActions,
  liveStreamActiveIds, sessionStateVersion, sessionGuideRequest, getApiConfig,
  openSessionGuideDetail,
} from '../../../utils/session-store.js';
import { toggleFavoriteWithFeedback, toggleScheduleWithFeedback } from '../../../services/sessions/action-feedback.js';
import { deriveSessionState, getNowMs } from '../../../utils/session-state.js';

// Reference implementation for SHARED-STATE-USAGE.md's patterns — reads the page-level
// session-store signals and mutates them through action-feedback.js/openSessionGuideDetail(),
// with no Preact dependency. Not authored on any real event page. eventConfig is
// getApiConfig() itself, same object any other block would forward — not a demo-only shape.

function renderRow(parent, label) {
  const row = createTag('p', { class: 'session-state-demo__row' }, '', { parent });
  createTag('strong', {}, `${label}: `, { parent: row });
  return createTag('span', { class: 'session-state-demo__value' }, '', { parent: row });
}

export default async function init(el) {
  el.innerHTML = '';
  createTag('h3', {}, 'Session state demo', { parent: el });

  const statusValue = renderRow(el, 'Sessions status');
  const countValue = renderRow(el, 'Sessions loaded');
  const favoritedValue = renderRow(el, 'Favorited');
  const scheduledValue = renderRow(el, 'Scheduled');
  const loggedInValue = renderRow(el, 'Logged in');
  const registeredValue = renderRow(el, 'Registered');
  const firstSessionStateValue = renderRow(el, 'First session state');
  const sessionGuideRequestValue = renderRow(el, 'Session guide request');

  sessionsStatus.subscribe((status) => { statusValue.textContent = status; });
  sessions.subscribe((list) => { countValue.textContent = String(list.length); });
  favorited.subscribe((ids) => { favoritedValue.textContent = String(ids.size); });
  scheduled.subscribe((ids) => { scheduledValue.textContent = String(ids.size); });
  auth.subscribe(({ isLoggedIn, isRegistered }) => {
    loggedInValue.textContent = String(isLoggedIn);
    registeredValue.textContent = String(isRegistered);
  });
  // No-ops if sessions-guide isn't also mounted on the page (see openSessionGuideDetail's
  // own doc comment) — this row still reflects the request signal firing either way, so
  // the demo is visibly meaningful even standalone.
  sessionGuideRequest.subscribe((request) => {
    sessionGuideRequestValue.textContent = request ? request.sessionId : 'none';
  });

  // sessionStateVersion only fires when a session's upcoming/live/on-demand bucket
  // actually changes (see session-state-ticker.js) — not on every tick — so this is the
  // only subscription needed to keep this row live as the event progresses, instead of
  // also subscribing to `sessions`/`liveStreamActiveIds` directly.
  sessionStateVersion.subscribe(() => {
    const [firstSession] = sessions.value;
    firstSessionStateValue.textContent = firstSession
      ? deriveSessionState(firstSession, liveStreamActiveIds.value, getNowMs())
      : 'n/a';
  });

  const favoriteBtn = createTag(
    'button',
    { type: 'button', class: 'session-state-demo__btn session-state-demo__btn--favorite' },
    'Favorite first session',
    { parent: el },
  );
  favoriteBtn.addEventListener('click', () => {
    const [firstSession] = sessions.value;
    if (!firstSession || pendingActions.value.has(firstSession.id)) return;
    toggleFavoriteWithFeedback(firstSession, {
      eventConfig: getApiConfig() || {},
      isFavorited: favorited.value.has(firstSession.id),
    });
  });

  const scheduleBtn = createTag(
    'button',
    { type: 'button', class: 'session-state-demo__btn session-state-demo__btn--schedule' },
    'Schedule first session',
    { parent: el },
  );
  scheduleBtn.addEventListener('click', () => {
    const [firstSession] = sessions.value;
    if (!firstSession || pendingActions.value.has(firstSession.id)) return;
    toggleScheduleWithFeedback(firstSession, {
      eventConfig: getApiConfig() || {},
      isScheduled: scheduled.value.has(firstSession.id),
    });
  });

  const openDetailBtn = createTag(
    'button',
    { type: 'button', class: 'session-state-demo__btn session-state-demo__btn--open-detail' },
    'Open first session detail',
    { parent: el },
  );
  openDetailBtn.addEventListener('click', () => {
    const [firstSession] = sessions.value;
    if (!firstSession) return;
    openSessionGuideDetail(firstSession.id);
  });
}
