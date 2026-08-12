import { html } from '../../v1/deps/htm-preact.js';
import IconPicker from './IconPicker.js';
import { getDefaultTrackIcon, DEFAULT_ICON_COLOR, useIconSlugOptions } from '../default-track-icons.js';
import { isTrackIconEntryComplete } from '../utils.js';

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
            <span class="tec-track-editor__name">${track}</span>
            <${IconPicker}
              value=${icon}
              color=${color}
              options=${iconSlugs}
              onChange=${(newIcon) => onChange(track, { icon: newIcon })}
              ariaLabel="Icon for ${track}"
            />
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
