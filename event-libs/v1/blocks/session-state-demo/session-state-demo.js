import { createTag } from '../../utils/utils.js';
import {
  sessions, sessionsStatus, favorited, scheduled, auth, pendingActions,
  liveStreamActiveIds, sessionStateVersion,
} from '../../utils/session-store.js';
import { favoriteWithFeedback } from '../../services/sessions/action-feedback.js';
import { deriveSessionState, getNowMs } from '../../utils/session-state.js';

// Reference implementation for SHARED-STATE-USAGE.md's vanilla-JS pattern — reads the
// page-level session-store signals and mutates them through action-feedback.js, with
// no Preact dependency. Not authored on any real event page.
const DEMO_EVENT_CONFIG = { registerUrl: '/register' };

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

  sessionsStatus.subscribe((status) => { statusValue.textContent = status; });
  sessions.subscribe((list) => { countValue.textContent = String(list.length); });
  favorited.subscribe((ids) => { favoritedValue.textContent = String(ids.size); });
  scheduled.subscribe((ids) => { scheduledValue.textContent = String(ids.size); });
  auth.subscribe(({ isLoggedIn, isRegistered }) => {
    loggedInValue.textContent = String(isLoggedIn);
    registeredValue.textContent = String(isRegistered);
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
    { type: 'button', class: 'session-state-demo__favorite-btn' },
    'Favorite first session',
    { parent: el },
  );
  favoriteBtn.addEventListener('click', () => {
    const [firstSession] = sessions.value;
    if (!firstSession || pendingActions.value.has(firstSession.id)) return;
    favoriteWithFeedback(firstSession, {
      eventConfig: DEMO_EVENT_CONFIG,
      isFavorited: favorited.value.has(firstSession.id),
    });
  });
}
