import { html } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';

export function DateTabs() {
  const { state, dispatch } = useSessionGuide();
  const { activeDay, activeView, eventDays } = state;
  const disabled = activeView === 'on-demand';

  function formatDay(isoDate) {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
      .format(new Date(`${isoDate}T12:00:00`)); // noon avoids DST edge at midnight
  }

  return html`
    <div class=${`sg-date-tabs${disabled ? ' sg-date-tabs--disabled' : ''}`} role="tablist">
      ${(eventDays || []).map((day) => html`
        <button
          class=${`sg-date-tab${activeDay === day ? ' sg-date-tab--active' : ''}`}
          onclick=${() => dispatch({ type: 'SET_DAY', day })}
          role="tab"
          aria-selected=${activeDay === day}
          type="button"
          disabled=${disabled}
        >${formatDay(day)}</button>
      `)}
    </div>
  `;
}
