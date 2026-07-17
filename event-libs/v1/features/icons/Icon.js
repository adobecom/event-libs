import { html, useRef, useEffect } from '../../deps/htm-preact.js';
import { resolveIcon } from './icon-resolver.js';

export function Icon({ name, size = 20, className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const svg = await resolveIcon(name);
      if (cancelled || !svg || !ref.current) return;
      svg.setAttribute('width', size);
      svg.setAttribute('height', size);
      ref.current.replaceChildren(svg);
    })();
    return () => { cancelled = true; };
  }, [name, size]);

  return html`<span ref=${ref} class="sg-icon ${className}" aria-hidden="true"></span>`;
}
