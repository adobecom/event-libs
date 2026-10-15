// Milo's Lenis (foundation=c2) sets `.lenis.lenis-smooth iframe { pointer-events: none }` while it
// eases a scroll, so wheel input over an embedded player keeps feeding Lenis instead of being
// swallowed by the cross-origin iframe. Forcing the player iframes back to `pointer-events: auto`
// (MWPW-208781) let them capture the wheel mid-glide; the browser then chained a native scroll that
// Lenis overwrote on its next frame, so the page jittered and the cursor "stuck" on the player
// (MWPW-211613).
//
// Instead we keep Lenis's default and halt the glide as soon as the user reaches for a player:
// Lenis resets, drops `lenis-smooth`, the iframe is interactive immediately, and any later wheel
// over it is a plain native scroll that Lenis follows rather than fights.
//
// Only wheel/keyboard glides are halted: Lenis advances `targetScroll` alongside `animatedScroll`
// for programmatic scrollTo() glides (anchors, scroll-to-top), so the immediate scrollTo below is a
// no-op for those, and a `lock`ed scroll is skipped by Lenis itself.

export const PLAYER_SELECTOR = [
  '.sb-player__mount',
  '.session-video-player .milo-video',
  '.event-youtube .youtube-video-container',
  '.event-youtube .youtube-chat-container',
].join(', ');

// Pointer movement this soon after a wheel event is incidental hand motion mid-scroll, not intent.
export const WHEEL_SETTLE_MS = 150;

let installed = false;
let lastWheelAt = -Infinity;

function haltGlideOverPlayer(target) {
  const { lenis } = window;
  if (lenis?.isScrolling !== 'smooth' || !target?.closest?.(PLAYER_SELECTOR)) return;
  lenis.scrollTo(lenis.animatedScroll, { immediate: true });
}

function onWheel(e) {
  lastWheelAt = e.timeStamp;
}

function onPointerMove(e) {
  if (window.lenis?.isScrolling !== 'smooth') return;
  if (e.pointerType === 'touch' || (!e.movementX && !e.movementY)) return;
  if (e.timeStamp - lastWheelAt < WHEEL_SETTLE_MS) return;
  haltGlideOverPlayer(e.target);
}

function onPointerDown(e) {
  haltGlideOverPlayer(e.target);
}

export function installPlayerScrollGuard() {
  if (installed) return;
  installed = true;
  const opts = { capture: true, passive: true };
  window.addEventListener('wheel', onWheel, opts);
  document.addEventListener('pointermove', onPointerMove, opts);
  document.addEventListener('pointerdown', onPointerDown, opts);
}
