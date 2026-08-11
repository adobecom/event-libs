import { useState, useEffect, html } from '../../v1/deps/htm-preact.js';
import { KNOWN_ICON_SLUGS, getDefaultTrackIcon, DEFAULT_ICON_COLOR } from '../default-track-icons.js';
import { loadTrackIconSprite } from '../track-icon-sprite.js';
import { isTrackIconEntryComplete } from '../utils.js';

export function IconPreview({ icon, color }) {
  const [symbols, setSymbols] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadTrackIconSprite().then((result) => { if (!cancelled) setSymbols(result); });
    return () => { cancelled = true; };
  }, []);

  const symbol = icon && symbols?.[icon];
  if (!symbol) return html`<svg class="tec-track-editor__preview" width="24" height="24" aria-hidden="true"></svg>`;

  return html`
    <svg
      class="tec-track-editor__preview"
      width="24"
      height="24"
      viewBox=${symbol.viewBox}
      style=${`color:${color}`}
      aria-hidden="true"
      dangerouslySetInnerHTML=${{ __html: symbol.innerHTML }}
    ></svg>
  `;
}

export default function TrackIconEditor({ tracks, trackIcons, onChange }) {
  if (!tracks || tracks.length === 0) {
    return html`<p class="tec-track-editor__empty">No tracks found in this event's sessions yet.</p>`;
  }

  return html`
    <ul class="tec-track-editor__list">
      ${tracks.map((track) => {
        const authored = trackIcons?.[track];
        const fallback = getDefaultTrackIcon(track);
        const icon = authored?.icon ?? fallback?.icon ?? '';
        const color = authored?.color ?? DEFAULT_ICON_COLOR;
        const complete = isTrackIconEntryComplete(authored);

        return html`
          <li class="tec-track-editor__row ${complete ? '' : 'is-incomplete'}" key=${track}>
            <div class="tec-track-editor__preview-wrap">
              <${IconPreview} icon=${icon} color=${color} />
            </div>
            <span class="tec-track-editor__name">${track}</span>
            <select
              class="tec-field tec-track-editor__icon-select"
              value=${icon}
              onChange=${(e) => onChange(track, { icon: e.target.value })}
            >
              <option value="">— no icon —</option>
              ${KNOWN_ICON_SLUGS.map((slug) => html`<option value=${slug} key=${slug}>${slug}</option>`)}
            </select>
            <input
              type="color"
              class="tec-track-editor__color-input"
              value=${color}
              onInput=${(e) => onChange(track, { color: e.target.value })}
              aria-label="${track} color"
            />
            ${!complete && html`
              <span class="tec-track-editor__warning">Color set with no icon — pick one, or clear the color</span>
            `}
          </li>
        `;
      })}
    </ul>
  `;
}
