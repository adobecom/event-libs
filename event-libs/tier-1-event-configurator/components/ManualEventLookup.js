import { useState } from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import { getEspEvent } from '../../v1/utils/esp-controller.js';
import Modal from './Modal.js';

// Fallback for New Config/Duplicate while listEvents()'s CORS gap is open
// (see constants.js's EVENT_BROWSE_ENABLED) — author enters a known Event ID
// directly rather than browsing/searching the full catalog. getEspEvent()
// looks it up for real (confirmed CORS-free, unlike the list endpoint) so
// the author can confirm the title/published state before proceeding.
export default function ManualEventLookup({
  isOpen, onClose, onSelect, title = 'Enter an Event ID',
}) {
  const [eventId, setEventId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [foundEvent, setFoundEvent] = useState(null);

  const reset = () => {
    setEventId('');
    setIsLoading(false);
    setError(null);
    setFoundEvent(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleLookup = async () => {
    const trimmed = eventId.trim();
    if (!trimmed) return;
    setIsLoading(true);
    setError(null);
    setFoundEvent(null);
    const result = await getEspEvent(trimmed);
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
