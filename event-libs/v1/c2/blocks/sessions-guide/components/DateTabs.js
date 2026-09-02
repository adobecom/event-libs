import { html } from '../../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';

export function DateTabs() {
  const { state, dispatch } = useSessionGuide();
  const { activeDay, activeView, eventDays } = state;
  const disabled = activeView === 'on-demand';

  function formatDay(isoDate) {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
      .format(new Date(`${isoDate}T12:00:00`)); // noon avoids DST edge at midnight
  }

  // Deliberately not role="tablist"/"tab": these filter the view in place, and there is no
  // element that can honestly be their tabpanel. Tab roles would promise arrow-key
  // navigation and an aria-controls relationship this widget doesn't have, so it uses
  // plain toggle buttons instead — the same pattern as MySessionsView's tab bar.
  return html`
    <div class=${`sg-date-tabs${disabled ? ' sg-date-tabs--disabled' : ''}`} role="group" aria-label="Event day">
      ${(eventDays || []).map((day) => html`
        <button
          class=${`sg-date-tab${activeDay === day ? ' sg-date-tab--active' : ''}`}
          onclick=${() => dispatch({ type: 'SET_DAY', day })}
          key=${day}
          aria-pressed=${String(activeDay === day)}
          type="button"
          disabled=${disabled}
        >${formatDay(day)}</button>
      `)}
    </div>
  `;
}
