import { html } from '../../v1/deps/htm-preact.js';
import { DEFAULT_OVERRIDE_TRACK_ICON, KNOWN_ICON_SLUGS } from '../default-track-icons.js';
import IconPicker, { useIconSlugOptions } from './IconPicker.js';

// Override text is free text, not a real track, and each distinct value is its own
// swimlane — mirrors TrackIconEditor's per-value list instead of a single icon/color pair.
// defaultOverrideIcon is the fallback for any text not yet mapped below.
export default function OverrideTrackIconEditor({
  overrideTexts, overrideTrackIcons, defaultOverrideIcon, onChangeMapped, onChangeDefault,
}) {
  const iconSlugs = useIconSlugOptions(KNOWN_ICON_SLUGS);
  const defaultIcon = defaultOverrideIcon?.icon ?? DEFAULT_OVERRIDE_TRACK_ICON.icon;
  const defaultColor = defaultOverrideIcon?.color ?? DEFAULT_OVERRIDE_TRACK_ICON.color;

  return html`
    <div class="tec-override-editor">
      <div class="tec-track-editor__row">
        <span class="tec-track-editor__name">Default (unmapped override text)</span>
        <${IconPicker}
          value=${defaultIcon}
          color=${defaultColor}
          options=${iconSlugs}
          onChange=${(newIcon) => onChangeDefault({ icon: newIcon, color: defaultColor })}
          ariaLabel="Default override icon"
        />
        <input
          type="color"
          class="tec-track-editor__color-input"
          value=${defaultColor}
          onInput=${(e) => onChangeDefault({ icon: defaultIcon, color: e.target.value })}
          aria-label="Default override icon color"
        />
      </div>

      ${overrideTexts.length === 0
    ? html`<p class="tec-track-editor__empty">No Override Primary Event Site Track text found in this event's sessions yet.</p>`
    : html`
          <ul class="tec-track-editor__list">
            ${overrideTexts.map((text) => {
    const authored = overrideTrackIcons?.[text];
    const icon = authored?.icon ?? defaultIcon;
    const color = authored?.color ?? defaultColor;
    return html`
                <li class="tec-track-editor__row" key=${text}>
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
                </li>
              `;
  })}
          </ul>
        `}
    </div>
  `;
}
