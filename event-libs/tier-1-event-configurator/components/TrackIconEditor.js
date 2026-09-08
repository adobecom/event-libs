import { html } from '../../v1/deps/htm-preact.js';
import { Icon } from '../../v1/features/icons/Icon.js';
import { fetchFederalTrackIcon } from '../../v1/features/icons/federal-icons.js';
import { DEFAULT_ICON_COLOR } from '../default-track-icons.js';
import { isTrackIconEntryComplete, extractTrackIconSlug } from '../utils.js';

// Icon slug is a plain text field, not a searchable picker — federal's track-icon
// namespace (/federal/assets/icons/track-icons/) has no manifest to search, unlike the
// generic icon system (see federal-icons.js). Preview resolves from that namespace only
// (fetchFederalTrackIcon), so a typed slug never accidentally matches an unrelated icon.
// Mirrors ProductIconEditor.js's pattern; unlike products, tracks still carry an
// author-set color (the icon's own art is monochrome, tinted via the color input).
export default function TrackIconEditor({ tracks, trackIcons, onChange }) {
  if (!tracks || tracks.length === 0) {
    return html`<p class="tec-track-editor__empty">No tracks found in this event's sessions yet.</p>`;
  }

  return html`
    <ul class="tec-track-editor__list">
      ${tracks.map((track) => {
        const authored = trackIcons?.[track];
        const icon = authored?.icon ?? '';
        const color = authored?.color ?? DEFAULT_ICON_COLOR;
        const complete = isTrackIconEntryComplete(authored);

        return html`
          <li class="tec-track-editor__row ${complete ? '' : 'is-incomplete'}" key=${track}>
            <div class="tec-track-editor__preview-wrap" style="color:${color}">
              ${icon && html`<${Icon} name=${icon} size=${20} resolve=${fetchFederalTrackIcon} />`}
            </div>
            <span class="tec-track-editor__name">${track}</span>
            <input
              type="text"
              class="tec-field tec-track-editor__icon-input"
              placeholder="Icon slug (e.g. branding), or paste the full federal icon URL"
              value=${icon}
              onInput=${(e) => onChange(track, { icon: extractTrackIconSlug(e.target.value) })}
              aria-label="Icon slug for ${track}"
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
