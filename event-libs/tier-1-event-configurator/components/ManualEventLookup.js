import { useState, useRef } from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import { getEspEvent } from '../../v1/utils/esp-controller.js';
import Modal from './Modal.js';
import { useEventEnv } from '../context/EventEnvContext.js';
import { EVENT_SERVICE_ENV_OPTIONS } from '../constants.js';

// New Config/Duplicate's fallback when EventPicker's full catalog browse
// fails at runtime (see Library.js's browseFailed) — author enters a known
// Event ID directly. getEspEvent() looks it up for real so they can confirm
// the title/published state before proceeding.
//
// Also the one place an author can target a non-prod ESP tier. The choice
// persists for the rest of the session (via EventEnvContext), applying to
// every later ESP call, not just this lookup — TierOneEventConfigurator.js
// shows a banner any time it's not prod.
export default function ManualEventLookup({
  isOpen, onClose, onSelect, title = 'Enter an Event ID',
}) {
  const { envName, setEnv } = useEventEnv();
  const [eventId, setEventId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [foundEvent, setFoundEvent] = useState(null);
  // Bumped on every new lookup and on every env change, so a response that
  // lands after either has happened (e.g. Enter pressed twice, or the env
  // switched while a request was in flight) is recognized as stale and
  // discarded instead of silently overwriting newer state.
  const requestIdRef = useRef(0);

  const reset = () => {
    setEventId('');
    setIsLoading(false);
    setError(null);
    setFoundEvent(null);
  };

  const handleEnvChange = (e) => {
    requestIdRef.current += 1;
    setEnv(e.target.value);
    setError(null);
    setFoundEvent(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleLookup = async () => {
    const trimmed = eventId.trim();
    if (!trimmed || isLoading) return;
    const requestId = (requestIdRef.current += 1);
    setIsLoading(true);
    setError(null);
    setFoundEvent(null);
    const result = await getEspEvent(trimmed);
    if (requestId !== requestIdRef.current) return;
    setIsLoading(false);
    if (!result.ok) {
      setError(result.status === 404 ? 'No event found with that ID.' : (result.error?.message || 'Failed to look up event — please retry.'));
      return;
    }
    setFoundEvent(result.data);
  };

  const handleUse = () => {
    if (!foundEvent) return;
    onSelect(foundEvent);
    reset();
  };

  return html`
    <${Modal} isOpen=${isOpen} onClose=${handleClose} title=${title} showActions=${false} size="small">
      <div class="tec-manual-lookup">
        <p class="tec-manual-lookup__hint">
          Enter the Event ID exactly as it appears in ESP or the event page's own metadata.
        </p>
        <label class="tec-manual-lookup__env-row">
          <span class="tec-manual-lookup__env-label">Environment</span>
          <select class="tec-field tec-manual-lookup__env-select" value=${envName} onChange=${handleEnvChange}>
            ${EVENT_SERVICE_ENV_OPTIONS.map((opt) => html`<option value=${opt.value} key=${opt.value}>${opt.label}</option>`)}
          </select>
        </label>
        <div class="tec-manual-lookup__row">
          <input
            type="text"
            class="tec-field tec-manual-lookup__input"
            placeholder="Event ID"
            value=${eventId}
            onInput=${(e) => setEventId(e.target.value)}
            onKeyDown=${(e) => { if (e.key === 'Enter') handleLookup(); }}
          />
          <button
            type="button"
            class="tec-btn tec-btn--primary"
            onClick=${handleLookup}
            disabled=${isLoading || !eventId.trim()}
          >
            ${isLoading ? 'Looking up…' : 'Look up'}
          </button>
        </div>
        ${error && html`<p class="tec-manual-lookup__error">${error}</p>`}
        ${foundEvent && html`
          <div class="tec-manual-lookup__result">
            <p class="tec-manual-lookup__result-title">${foundEvent.enTitle || foundEvent.eventId}</p>
            <p class="tec-manual-lookup__result-meta">
              ${foundEvent.eventId} · ${foundEvent.published ? 'Published' : 'Draft'}
            </p>
            <button type="button" class="tec-btn tec-btn--primary" onClick=${handleUse}>Use this event</button>
          </div>
        `}
      </div>
    </${Modal}>
  `;
}
