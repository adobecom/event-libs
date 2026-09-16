import { html, useState, useEffect } from '../../v1/deps/htm-preact.js';
import { Icon } from '../../v1/features/icons/Icon.js';
import { fetchFederalTrackIcon } from '../../v1/features/icons/federal-icons.js';
import { DEFAULT_ICON_COLOR } from '../default-track-icons.js';
import { isTrackIconEntryComplete, extractTrackIconSlug } from '../utils.js';

function OverrideTrackIconRow({ text, authored, onChangeMapped }) {
  const icon = authored?.icon ?? '';
  const color = authored?.color ?? DEFAULT_ICON_COLOR;
  const complete = isTrackIconEntryComplete(authored);

  // Catches a slug that doesn't resolve — e.g. one authored before the track-icon namespace
  // migration — which otherwise fails silently with no validation on this free-text field.
  const [notFound, setNotFound] = useState(false);
  useEffect(() => {
    if (!icon) { setNotFound(false); return undefined; }
    let cancelled = false;
    fetchFederalTrackIcon(icon).then((svg) => { if (!cancelled) setNotFound(!svg); });
    return () => { cancelled = true; };
  }, [icon]);

  return html`
    <li class="tec-track-editor__row ${complete ? '' : 'is-incomplete'}">
      <div class="tec-track-editor__preview-wrap" style="color:${color}">
        ${icon && html`<${Icon} name=${icon} size=${20} resolve=${fetchFederalTrackIcon} />`}
      </div>
      <span class="tec-track-editor__name">${text}</span>
      <input
        type="text"
        class="tec-field tec-track-editor__icon-input"
        placeholder="Icon slug (e.g. branding), or paste the full federal icon URL"
        value=${icon}
        onInput=${(e) => onChangeMapped(text, { icon: extractTrackIconSlug(e.target.value), color })}
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
      ${notFound && html`
        <span class="tec-track-editor__warning">Icon "${icon}" not found — check the slug</span>
      `}
    </li>
  `;
}

export default function OverrideTrackIconEditor({
  overrideTexts, overrideTrackIcons, onChangeMapped,
}) {
  return html`
    <div class="tec-override-editor">
      ${overrideTexts.length === 0
    ? html`<p class="tec-track-editor__empty">No Override Primary Event Site Track text found in this event's sessions yet.</p>`
    : html`
          <ul class="tec-track-editor__list">
            ${overrideTexts.map((text) => html`
              <${OverrideTrackIconRow}
                key=${text}
                text=${text}
                authored=${overrideTrackIcons?.[text]}
                onChangeMapped=${onChangeMapped}
              />
            `)}
          </ul>
        `}
    </div>
  `;
}
