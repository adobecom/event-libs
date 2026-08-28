// Scaffolding only (Phase 0, MWPW-198725) — proves the block is registered and loadable.
// Real UI/state wiring (BroadcastApp, players, carousels) lands in later phases.
export default async function init(el) {
  el.innerHTML = '';
  el.classList.add('session-broadcast');
}
