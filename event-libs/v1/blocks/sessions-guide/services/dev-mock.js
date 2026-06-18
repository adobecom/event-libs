// Dev-only: simulate a logged-in, registered user.
// Imported by scripts/scripts.js on localhost only.
//
// Uses localStorage (sg:dev-auth) rather than BlockMediator so that Milo's
// own IMS flow — which sets imsProfile to a guest profile on unauthenticated
// page loads — cannot overwrite the dev user state.

const LS_SCHEDULED = 'sg:scheduled';
const LS_FAVORITED = 'sg:favorited';
const LS_DEV_AUTH = 'sg:dev-auth';

// A handful of session IDs from MOCK_SESSIONS that span different days/tracks.
const SEED_SCHEDULED = ['k-001', 's-001', 's-002', 's-006'];
const SEED_FAVORITED = ['k-001', 's-001', 's-003', 's-007'];

export function setupDevUser() {
  try {
    localStorage.setItem(LS_DEV_AUTH, JSON.stringify({
      isLoggedIn: true,
      isRegistered: true,
      userFirstName: 'Dev',
    }));
  } catch { /* ignore */ }
}

export function seedDevStorage() {
  try {
    if (!localStorage.getItem(LS_SCHEDULED)) {
      localStorage.setItem(LS_SCHEDULED, JSON.stringify(SEED_SCHEDULED));
    }
    if (!localStorage.getItem(LS_FAVORITED)) {
      localStorage.setItem(LS_FAVORITED, JSON.stringify(SEED_FAVORITED));
    }
  } catch { /* ignore */ }
}
