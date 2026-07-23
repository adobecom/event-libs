import { useState, useEffect, useMemo, useCallback } from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import { listAllEvents } from '../../v1/utils/esp-controller.js';
import Modal from './Modal.js';
import SearchInput from './SearchInput.js';

const PUBLISH_FILTERS = ['all', 'published', 'draft'];
const PUBLISH_FILTER_LABELS = { all: 'All', published: 'Published', draft: 'Draft' };

export default function EventPicker({
  isOpen, onClose, onSelect, onError, title = 'Select an event',
}) {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [publishFilter, setPublishFilter] = useState('all');

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    listAllEvents()
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          const message = result.error || 'Failed to load events';
          setError(message);
          // Caller (Library.js) treats this as the signal to fail over to
          // ManualEventLookup for the rest of the session — see its
          // handleBrowseError. Firing on any failure, not just CORS/auth
          // ones, keeps that fallback authoritative rather than duplicating
          // failure-classification logic here.
          onError?.(message);
          return;
        }
        setEvents(result.data);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [isOpen, onError]);

  const filteredEvents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter((event) => {
      if (publishFilter === 'published' && !event.published) return false;
      if (publishFilter === 'draft' && event.published) return false;
      if (!term) return true;
      const title = (event.enTitle || '').toLowerCase();
      return title.includes(term) || (event.eventId || '').toLowerCase().includes(term);
    });
  }, [events, search, publishFilter]);

  const handleSearch = useCallback((e) => setSearch(e.target.value), []);

  return html`
    <${Modal} isOpen=${isOpen} onClose=${onClose} title=${title} showActions=${false} size="large">
      <div class="tec-event-picker">
        <div class="tec-event-picker__controls">
          <${SearchInput} \
            id="tec-event-picker-search" \
            placeholder="Search by title or Event ID" \
            value=${search} \
            onInput=${handleSearch} \
            className="tec-event-picker__search" \
          />
          <div class="tec-event-picker__publish-filter">
            ${PUBLISH_FILTERS.map((f) => html`
              <button \
                type="button" \
                key=${f} \
                class="tec-event-picker__publish-filter-btn ${f === publishFilter ? 'is-active' : ''}" \
                onClick=${() => setPublishFilter(f)} \
              >
                ${PUBLISH_FILTER_LABELS[f]}
              </button>
            `)}
          </div>
        </div>
        ${isLoading && html`<p class="tec-event-picker__status">Loading events…</p>`}
        ${error && html`<p class="tec-event-picker__status tec-event-picker__status--error">${error}</p>`}
        ${!isLoading && !error && html`
          <ul class="tec-event-picker__list">
            ${filteredEvents.map((event) => html`
              <li class="tec-event-picker__item" key=${event.eventId}>
                <sp-action-button quiet size="l" onClick=${() => onSelect(event)}>
                  <span class="tec-event-picker__item-title">${event.enTitle || event.eventId}</span>
                  <span class="tec-event-picker__item-meta">${event.eventId} · ${event.published ? 'Published' : 'Draft'}</span>
                </sp-action-button>
              </li>
            `)}
            ${filteredEvents.length === 0 && html`<li class="tec-event-picker__empty">No events match.</li>`}
          </ul>
        `}
      </div>
    </${Modal}>
  `;
}
