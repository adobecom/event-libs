// Milo's Lenis (foundation=c2) makes iframes inert (`.lenis.lenis-smooth iframe { pointer-events:
// none }`) while it eases a scroll, because a cross-origin player would otherwise swallow the wheel
// and chain a native scroll that Lenis overwrites every frame — the jitter in MWPW-211613. We keep
// that, but the ease-out tail outlasts the visible motion by a second or more, leaving the player
// unclickable (MWPW-208781). So when the user reaches for a player once wheel input has stopped,
// end the glide: Lenis drops `lenis-smooth` and the player is interactive straight away.

// Wheel input (incl. trackpad momentum) counts as ongoing until it has been quiet this long.
const WHEEL_IDLE_MS = 150;

let lastWheelAt = -Infinity;
let wheelTracked = false;

const wheelIdleIn = () => WHEEL_IDLE_MS - (performance.now() - lastWheelAt);

// An immediate scrollTo to where the glide currently is ends it in place: Lenis resets, swallows
// the trailing native scroll event and goes idle. It's a no-op while Lenis is stopped (e.g. by a
// modal) or locked, and for programmatic scrollTo() glides (anchors, scroll-to-top), where Lenis
// keeps targetScroll in step with animatedScroll — so only a wheel glide, whose target is still
// ahead, is ended.
function endWheelGlide() {
  const { lenis } = window;
  if (lenis?.isScrolling !== 'smooth') return;
  lenis.scrollTo(lenis.animatedScroll, { immediate: true });
}

/**
 * Ends a wheel-driven Lenis glide when the user moves a mouse or pen over `player` (once wheel
 * input has stopped), or presses on it. A press can't reach the iframe itself — it was inert
 * when hit-tested — but it makes the next click land. Returns a cleanup.
 */
export function guardPlayerScroll(player) {
  if (!wheelTracked) {
    wheelTracked = true;
    window.addEventListener('wheel', () => { lastWheelAt = performance.now(); }, { capture: true, passive: true });
  }

  const controller = new AbortController();
  const opts = { passive: true, signal: controller.signal };
  let intent = false;
  let timer;

  const settle = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!intent || controller.signal.aborted) return;
    const wait = wheelIdleIn();
    if (wait > 0) {
      timer = setTimeout(settle, wait);
      return;
    }
    intent = false;
    endWheelGlide();
  };

  player.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || (!e.movementX && !e.movementY)) return;
    if (window.lenis?.isScrolling !== 'smooth') return;
    intent = true;
    if (!timer) settle();
  }, opts);
  player.addEventListener('pointerleave', () => { intent = false; }, opts);
  player.addEventListener('pointerdown', endWheelGlide, opts);

  return () => {
    controller.abort();
    clearTimeout(timer);
  };
}
