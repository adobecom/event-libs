import { html } from '../../../deps/htm-preact.js';

/**
 * S2A icon-only button.
 *
 * @param {object}   props
 * @param {any}      props.children  - Icon SVG (use fill="currentColor")
 * @param {string}   props.label     - Accessible name (aria-label), required
 * @param {function} [props.onclick]
 * @param {boolean}  [props.disabled]
 * @param {boolean}  [props.pressed]  - Set for toggle buttons (aria-pressed)
 * @param {'solid'|'outlined'|'transparent'} [props.variant='solid']
 * @param {'on-light'|'on-dark'}             [props.context='on-light']
 * @param {'xs'|'md'|'lg'}                   [props.size='md']
 */
export function IconButton({
  children,
  label,
  onclick,
  disabled,
  pressed,
  variant = 'solid',
  context = 'on-light',
  size = 'md',
  extraClass,
}) {
  const cls = [
    'sg-icon-btn',
    `sg-icon-btn--${variant}`,
    `sg-icon-btn--${context}`,
    `sg-icon-btn--${size}`,
    extraClass,
  ].filter(Boolean).join(' ');

  return html`
    <button
      class=${cls}
      onclick=${onclick}
      aria-label=${label}
      aria-pressed=${pressed !== undefined ? String(pressed) : undefined}
      disabled=${disabled || undefined}
      type="button"
    >
      <span class="sg-icon-btn__icon" aria-hidden="true">${children}</span>
    </button>
  `;
}
