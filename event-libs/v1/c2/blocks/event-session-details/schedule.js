import { createTag, getMetadata } from '../../../utils/utils.js';
import {
  initSessionState, sessions, scheduled, getApiConfig,
} from '../../../utils/session-store.js';
import { toggleScheduleWithFeedback } from '../../../services/sessions/action-feedback.js';

const CALENDAR_ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M7.97919 14.975H4.025C3.65279 14.975 3.35 14.6722 3.35 14.3V7.775H15.05V7.90419C15.05 8.27685 15.3523 8.57919 15.725 8.57919C16.0977 8.57919 16.4 8.27685 16.4 7.90419V4.85C16.4 3.73335 15.4916 2.825 14.375 2.825H12.575V1.925C12.575 1.55235 12.2727 1.25 11.9 1.25C11.5273 1.25 11.225 1.55235 11.225 1.925V2.825H7.175V1.925C7.175 1.55235 6.87265 1.25 6.5 1.25C6.12735 1.25 5.825 1.55235 5.825 1.925V2.825H4.025C2.90835 2.825 2 3.73335 2 4.85V14.3C2 15.4166 2.90835 16.325 4.025 16.325H7.97919C8.35185 16.325 8.65419 16.0227 8.65419 15.65C8.65419 15.2773 8.35185 14.975 7.97919 14.975ZM4.025 4.175H5.825V4.625C5.825 4.99765 6.12735 5.3 6.5 5.3C6.87265 5.3 7.175 4.99765 7.175 4.625V4.175H11.225V4.625C11.225 4.99765 11.5273 5.3 11.9 5.3C12.2727 5.3 12.575 4.99765 12.575 4.625V4.175H14.375C14.7472 4.175 15.05 4.47779 15.05 4.85V6.425H3.35V4.85C3.35 4.47779 3.65279 4.175 4.025 4.175Z" fill="currentColor"/><path d="M14.55 10.5C12.3132 10.5 10.5 12.3132 10.5 14.55C10.5 16.7868 12.3132 18.6 14.55 18.6C16.7868 18.6 18.6 16.7868 18.6 14.55C18.6 12.3132 16.7868 10.5 14.55 10.5ZM16.8 15.1125H15.1125V16.8C15.1125 17.1107 14.8607 17.3625 14.55 17.3625C14.2393 17.3625 13.9875 17.1107 13.9875 16.8V15.1125H12.3C11.9893 15.1125 11.7375 14.8607 11.7375 14.55C11.7375 14.2393 11.9893 13.9875 12.3 13.9875H13.9875V12.3C13.9875 11.9893 14.2393 11.7375 14.55 11.7375C14.8607 11.7375 15.1125 11.9893 15.1125 12.3V13.9875H16.8C17.1107 13.9875 17.3625 14.2393 17.3625 14.55C17.3625 14.8607 17.1107 15.1125 16.8 15.1125Z" fill="currentColor"/></svg>';

export function renderSchedule() {
  const sessionId = getMetadata('session-id');
  if (!sessionId) return null;

  initSessionState();

  const eventConfig = {
    title: getMetadata('event-title') || getMetadata('title') || '',
    registerUrl: getApiConfig()?.registerUrl || '/register',
  };

  let session = sessions.value.find((s) => s.id === sessionId) || { id: sessionId };
  if (!session.rfCode) {
    const unsubscribe = sessions.subscribe((list) => {
      const found = list.find((s) => s.id === sessionId);
      if (found) { session = found; unsubscribe(); }
    });
  }

  const btn = createTag('button', {
    type: 'button',
    class: 'session-primary-cta-btn session-schedule',
  });

  const paint = () => {
    const isScheduled = scheduled.value.has(sessionId);
    btn.innerHTML = `${CALENDAR_ICON}<span>${isScheduled ? 'Added to schedule' : 'Add to schedule'}</span>`;
    btn.setAttribute('daa-ll', isScheduled ? 'Remove-from-Schedule' : 'Add-to-Schedule');
    btn.classList.toggle('is-scheduled', isScheduled);
  };
  paint();
  scheduled.subscribe(paint);

  btn.addEventListener('click', () => {
    toggleScheduleWithFeedback(session, {
      eventConfig,
      isScheduled: scheduled.value.has(sessionId),
    });
  });

  return btn;
}
