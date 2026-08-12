import { html } from '../../v1/deps/htm-preact.js';
import { Icon } from '../../v1/features/icons/Icon.js';
import { getDefaultTrackIcon, DEFAULT_ICON_COLOR, useIconSlugOptions } from '../default-track-icons.js';
import { isTrackIconEntryComplete } from '../utils.js';

// Renders through the same resolveIcon() chain (federal → Milo → event-libs' own
// track-icons.svg) session-guide's live badges use — see CategoryBadge.js's identical
// wrapping-span color convention — so the picker preview and the live page never drift.
export function IconPreview({ icon, color }) {
  if (!icon) return html`<span class="tec-track-editor__preview" aria-hidden="true"></span>`;

  return html`
    <span class="tec-track-editor__preview" style=${`color:${color}`}>
      <${Icon} name=${icon} size=${24} />
    </span>
  `;
}

export default function TrackIconEditor({ tracks, trackIcons, onChange }) {
  // Called unconditionally, before the early return below — Preact hooks must run in
  // the same order on every render.
  const iconSlugs = useIconSlugOptions();

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
              ${iconSlugs.map((slug) => html`<option value=${slug} key=${slug}>${slug}</option>`)}
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
