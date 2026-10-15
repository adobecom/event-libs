// Milo's Lenis (foundation=c2) makes iframes inert (`.lenis.lenis-smooth iframe { pointer-events:
// none }`) while it eases a scroll, because a cross-origin player would otherwise swallow the wheel
// and chain a native scroll that Lenis overwrites every frame — the jitter in MWPW-211613. We keep
// that, but Lenis's ease-out tail can outlast the visible motion by a second or more, leaving the
// player unclickable (MWPW-208781). So when the user reaches for a player mid-glide, end the glide:
// Lenis drops `lenis-smooth` and the player is interactive straight away.

// Pointer movement while wheel events are still arriving is the hand drifting mid-scroll, not intent.
const WHEEL_ACTIVE_MS = 150;

let lastWheelAt = -Infinity;
let wheelTracked = false;

function stopGlide() {
  const { lenis } = window;
  if (lenis?.isScrolling !== 'smooth' || lenis.isLocked) return;
  lenis.stop();
  lenis.start();
}

function onPointerMove(e) {
  if (e.pointerType !== 'mouse' || (!e.movementX && !e.movementY)) return;
  if (e.timeStamp - lastWheelAt < WHEEL_ACTIVE_MS) return;
  stopGlide();
}

/** Ends a Lenis glide when the user points at or presses on `player`. Returns a cleanup. */
export function guardPlayerScroll(player) {
  if (!wheelTracked) {
    wheelTracked = true;
    window.addEventListener('wheel', (e) => { lastWheelAt = e.timeStamp; }, { capture: true, passive: true });
  }
  const controller = new AbortController();
  const opts = { passive: true, signal: controller.signal };
  player.addEventListener('pointermove', onPointerMove, opts);
  player.addEventListener('pointerdown', stopGlide, opts);
  return () => controller.abort();
}
