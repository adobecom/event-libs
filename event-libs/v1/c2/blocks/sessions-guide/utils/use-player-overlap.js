import { useEffect, useState } from '../../../../deps/htm-preact.js';

// Every player an event page can render (MWPW-208524). Hidden players (display: none) have
// an empty rect, so they never count. Background videos have no controls and are excluded.
export const PLAYER_SELECTOR = [
  '.sb-player__mount', // session-broadcast (YouTube or Adobe TV/MPC)
  '.session-video-player', // on-demand session page
  '.milo-video', // Milo adobetv + youtube (e.g. homepage marquee)
  '.embed-vimeo', // Milo vimeo
  '.youtube-stream', // event-youtube stream (+ chat)
  '.youtube-video-container', // event-youtube lite embed
  '.mobile-rider-player', // Mobile Rider
  'video[controls]', // Milo native video with controls
].join(', ');
const DESKTOP_QUERY = '(min-width: 1280px)';

export function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// Desktop only, per the design decision on MWPW-208524.
export function isOverPlayer(el, root = document) {
  if (!el || !window.matchMedia?.(DESKTOP_QUERY).matches) return false;
  const rect = el.getBoundingClientRect();
  return [...root.querySelectorAll(PLAYER_SELECTOR)]
    .some((player) => rectsOverlap(rect, player.getBoundingClientRect()));
}

// Players mount and resize asynchronously, so re-check on body resize as well as scroll.
// Returns the cleanup; calls onChange(isOver) at most once per frame.
export function watchPlayerOverlap(getEl, onChange) {
  let frame = 0;
  const check = () => {
    frame = 0;
    onChange(isOverPlayer(getEl()));
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(check);
  };
  check();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  const resizeObserver = window.ResizeObserver ? new ResizeObserver(schedule) : null;
  resizeObserver?.observe(document.body);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    resizeObserver?.disconnect();
  };
}

export function usePlayerOverlap(ref, enabled) {
  const [overPlayer, setOverPlayer] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setOverPlayer(false);
      return undefined;
    }
    return watchPlayerOverlap(() => ref.current, setOverPlayer);
  }, [enabled]);

  return overPlayer;
}
