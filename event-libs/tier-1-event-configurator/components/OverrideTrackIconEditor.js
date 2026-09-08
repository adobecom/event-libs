import { html } from '../../v1/deps/htm-preact.js';
import { Icon } from '../../v1/features/icons/Icon.js';
import { fetchFederalTrackIcon } from '../../v1/features/icons/federal-icons.js';
import { DEFAULT_ICON_COLOR } from '../default-track-icons.js';
import { isTrackIconEntryComplete } from '../utils.js';

// Override text is free text, not a real track, and each distinct value is its own swimlane.
// Mirrors TrackIconEditor: every value is authored explicitly, with no event-wide fallback,
// and icon slug is a plain text field (not a searchable picker) resolved against federal's
// track-icon namespace only — see TrackIconEditor.js's own comment for why.
export default function OverrideTrackIconEditor({
  overrideTexts, overrideTrackIcons, onChangeMapped,
}) {
  return html`
    <div class="tec-override-editor">
      ${overrideTexts.length === 0
    ? html`<p class="tec-track-editor__empty">No Override Primary Event Site Track text found in this event's sessions yet.</p>`
    : html`
          <ul class="tec-track-editor__list">
            ${overrideTexts.map((text) => {
    const authored = overrideTrackIcons?.[text];
    const icon = authored?.icon ?? '';
    const color = authored?.color ?? DEFAULT_ICON_COLOR;
    const complete = isTrackIconEntryComplete(authored);
    return html`
                <li class="tec-track-editor__row ${complete ? '' : 'is-incomplete'}" key=${text}>
                  <div class="tec-track-editor__preview-wrap" style="color:${color}">
                    ${icon && html`<${Icon} name=${icon} size=${20} resolve=${fetchFederalTrackIcon} />`}
                  </div>
                  <span class="tec-track-editor__name">${text}</span>
                  <input
                    type="text"
                    class="tec-field tec-track-editor__icon-input"
                    placeholder="Icon slug (e.g. branding)"
                    value=${icon}
                    onInput=${(e) => onChangeMapped(text, { icon: e.target.value, color })}
                    aria-label="Icon slug for ${text}"
                  />
                  <input
                    type="color"
                    class="tec-track-editor__color-input"
                    value=${color}
                    onInput=${(e) => onChangeMapped(text, { icon, color: e.target.value })}
                    aria-label="${text} color"
                  />
                  ${!complete && html`
                    <span class="tec-track-editor__warning">Color set with no icon — pick one, or clear the color</span>
                  `}
                </li>
              `;
  })}
          </ul>
        `}
    </div>
  `;
}
