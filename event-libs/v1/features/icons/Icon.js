import { html, useRef, useEffect } from '../../deps/htm-preact.js';
import { resolveIcon } from './icon-resolver.js';

// `resolve` defaults to the shared federal→Milo→own-sprite chain (used everywhere on the
// live frontend); callers needing a different source (e.g. the configurator's
// product-icon preview, scoped to federal's product namespace only) pass their own.
export function Icon({ name, size = 20, className = '', resolve = resolveIcon }) {
  const ref = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const svg = await resolve(name);
      if (cancelled || !svg || !ref.current) return;
      svg.setAttribute('width', size);
      svg.setAttribute('height', size);
      ref.current.replaceChildren(svg);
    })();
    return () => { cancelled = true; };
  }, [name, size, resolve]);

  return html`<span ref=${ref} class="sg-icon ${className}" aria-hidden="true"></span>`;
}
