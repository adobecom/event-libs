import { html } from '../../v1/deps/htm-preact.js';
import { DEFAULT_ICON_COLOR } from '../default-track-icons.js';
import IconPicker, { useIconSlugOptions } from './IconPicker.js';
import { isTrackIconEntryComplete } from '../utils.js';

// Override text is free text, not a real track, and each distinct value is its own swimlane.
// Mirrors TrackIconEditor: every value is authored explicitly, with no event-wide fallback.
export default function OverrideTrackIconEditor({
  overrideTexts, overrideTrackIcons, onChangeMapped,
}) {
  const iconSlugs = useIconSlugOptions();

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
                  <span class="tec-track-editor__name">${text}</span>
                  <${IconPicker}
                    value=${icon}
                    color=${color}
                    options=${iconSlugs}
                    onChange=${(newIcon) => onChangeMapped(text, { icon: newIcon, color })}
                    ariaLabel="Icon for ${text}"
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
