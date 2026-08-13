import { html } from '../../v1/deps/htm-preact.js';
import {
  EVENT_AUTHORING_TIMEZONE, epochMsToZonedDateTimeLocal, zonedDateTimeToEpochMs,
} from '../utils.js';

// Two inputs bound to one underlying value (a UTC epoch ms, or null): a datetime-local
// picker shown in EVENT_AUTHORING_TIMEZONE, and the raw epoch itself, for anyone who
// already has a timestamp handy. Editing either updates valueMs, which re-derives both.
export default function EpochDateTimeField({
  idPrefix, label, valueMs, onChange,
}) {
  const localValue = epochMsToZonedDateTimeLocal(valueMs);
  const epochValue = valueMs ?? '';

  function handleLocalChange(e) {
    onChange(e.target.value ? zonedDateTimeToEpochMs(e.target.value) : null);
  }

  function handleEpochChange(e) {
    if (e.target.value === '') {
      onChange(null);
      return;
    }
    const next = Number(e.target.value);
    if (!Number.isNaN(next)) onChange(next);
  }

  return html`
    <div class="tec-editor__datetime-group">
      <label class="tec-editor__field-label" for="${idPrefix}-local">${label} (${EVENT_AUTHORING_TIMEZONE})</label>
      <input
        id="${idPrefix}-local"
        type="datetime-local"
        class="tec-field tec-editor__rf-input"
        value=${localValue}
        onInput=${handleLocalChange}
      />
      <label class="tec-editor__field-label" for="${idPrefix}-epoch">${label} (epoch ms)</label>
      <input
        id="${idPrefix}-epoch"
        type="number"
        class="tec-field tec-editor__rf-input"
        placeholder="e.g. 1792713600000"
        value=${epochValue}
        onInput=${handleEpochChange}
      />
    </div>
  `;
}
