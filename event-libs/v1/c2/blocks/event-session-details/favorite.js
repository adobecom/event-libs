import { createTag, getMetadata } from '../../../utils/utils.js';
import {
  initSessionState, sessions, favorited, getEventApiConfig,
} from '../../../utils/session-store.js';
import { toggleFavoriteWithFeedback } from '../../../services/sessions/action-feedback.js';

const ICON_HEART_OUTLINE = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M8.00005 14.3999C7.60904 14.3999 7.21802 14.2717 6.89146 14.0155C5.62271 13.0202 2.72935 10.4061 1.79185 8.87253C1.04576 7.65222 0.78951 6.14206 1.10631 4.83346C1.37818 3.71002 2.036 2.80378 3.00905 2.21081C4.10826 1.53971 5.42741 1.41315 6.45045 1.88034C6.97858 2.12174 7.54108 2.54206 7.99342 3.01706C8.45592 2.51315 9.01178 2.10534 9.56725 1.8733C10.6165 1.4319 11.9294 1.56314 12.9915 2.21081C13.9641 2.80378 14.6219 3.71002 14.8938 4.83346C15.2106 6.14206 14.9544 7.65222 14.2083 8.87253C13.2727 10.403 10.3786 13.0186 9.10866 14.0155C8.78249 14.2717 8.39107 14.3999 8.00005 14.3999ZM5.10982 2.79909C4.62466 2.79909 4.10553 2.94753 3.63365 3.23581C2.93834 3.65925 2.46803 4.30925 2.27272 5.1155C2.02897 6.12174 2.23209 7.29206 2.81529 8.24597C3.57779 9.49284 6.13482 11.8968 7.63209 13.0718C7.8485 13.2421 8.15124 13.2421 8.36765 13.0718C9.86648 11.8952 12.4239 9.4905 13.1844 8.24597C13.768 7.29206 13.9712 6.12175 13.7274 5.1155C13.5321 4.30925 13.0618 3.65925 12.3669 3.23581C11.6262 2.78425 10.7309 2.68659 10.0309 2.97956C9.48523 3.20846 8.88445 3.72956 8.49969 4.30769C8.27703 4.64206 7.72313 4.64206 7.50047 4.30769C7.15242 3.78503 6.50125 3.22331 5.95203 2.97253C5.69734 2.85612 5.41021 2.79909 5.10982 2.79909Z" fill="currentColor"/></svg>';
const ICON_HEART_FILLED = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M8.61426 17.5195C9.02246 17.8398 9.51123 18 10 18C10.4888 18 10.9781 17.8398 11.3858 17.5195C12.9732 16.2734 16.5908 13.0039 17.7603 11.0908C18.6929 9.56543 19.0132 7.67773 18.6172 6.04199C18.2774 4.63769 17.4551 3.50488 16.2393 2.76367C14.9116 1.95409 13.2705 1.79003 11.959 2.34179C11.2647 2.63183 10.5698 3.1416 9.99171 3.77148C9.42628 3.17773 8.72316 2.65234 8.063 2.35058C6.78419 1.7666 5.13526 1.9248 3.76124 2.76367C2.54493 3.50488 1.72266 4.63769 1.38282 6.04199C0.98682 7.67773 1.30713 9.56543 2.23975 11.0908C3.41162 13.0078 7.02832 16.2754 8.61426 17.5195Z" fill="currentColor"/></svg>';

export function renderFavorite() {
  const sessionId = getMetadata('session-id');
  if (!sessionId) return null;

  initSessionState();

  const eventConfig = {
    title: getMetadata('event-title') || getMetadata('title') || '',
    registerUrl: getEventApiConfig()?.registerUrl || '/register',
  };
  const sessionTitle = getMetadata('title') || getMetadata('en-title');

  let session = sessions.value.find((s) => s.id === sessionId) || { id: sessionId };
  if (!session.rfSessionId) {
    const unsubscribe = sessions.subscribe((list) => {
      const found = list.find((s) => s.id === sessionId);
      if (found) { session = found; unsubscribe(); }
    });
  }

  const btn = createTag('button', {
    type: 'button',
    class: 'session-action session-favorite',
    'aria-label': sessionTitle ? `Favorite ${sessionTitle}` : 'Favorite',
    'aria-pressed': 'false',
  });

  const paint = () => {
    const isFavorited = favorited.value.has(sessionId);
    btn.innerHTML = isFavorited ? ICON_HEART_FILLED : ICON_HEART_OUTLINE;
    btn.setAttribute('aria-pressed', String(isFavorited));
    btn.setAttribute('daa-ll', isFavorited ? 'Remove-from-Favorites' : 'Add-to-Favorites');
    btn.classList.toggle('is-favorited', isFavorited);
  };
  paint();
  favorited.subscribe(paint);

  btn.addEventListener('click', () => {
    toggleFavoriteWithFeedback(session, {
      eventConfig,
      isFavorited: favorited.value.has(sessionId),
    });
  });

  return btn;
}
