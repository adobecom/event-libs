import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import { renderFavorite } from '../../../../../event-libs/v1/c2/blocks/event-session-details/favorite.js';
import { favorited, sessions, auth } from '../../../../../event-libs/v1/utils/session-store.js';
import { toasts } from '../../../../../event-libs/v1/features/toast/toast.js';

describe('session-details favorite', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    favorited.value = new Set();
    sessions.value = [];
    auth.value = { isLoggedIn: null, isRegistered: undefined, userFirstName: null };
    toasts.value = [];
  });

  it('returns null without a session id', () => {
    expect(renderFavorite()).to.be.null;
  });

  it('renders an outline heart button with a bare label when no session title is present', () => {
    setMetadata('session-id', 'sid');
    const btn = renderFavorite();
    expect(btn.classList.contains('session-favorite')).to.be.true;
    expect(btn.getAttribute('aria-pressed')).to.equal('false');
    // Name stays constant; aria-pressed carries the state (avoids double announcement).
    expect(btn.getAttribute('aria-label')).to.equal('Favorite');
    expect(btn.querySelector('svg')).to.not.be.null;
  });

  it('includes the session title in the accessible name when present', () => {
    setMetadata('session-id', 'sid');
    setMetadata('title', 'Creative Workflows in the Cloud');
    const btn = renderFavorite();
    expect(btn.getAttribute('aria-label')).to.equal('Favorite Creative Workflows in the Cloud');
  });

  it('falls back to en-title when title is absent', () => {
    setMetadata('session-id', 'sid');
    setMetadata('en-title', 'Fallback Session Title');
    const btn = renderFavorite();
    expect(btn.getAttribute('aria-label')).to.equal('Favorite Fallback Session Title');
  });

  it('reflects the favorited signal without changing the accessible name', () => {
    setMetadata('session-id', 'sid');
    setMetadata('title', 'Creative Workflows in the Cloud');
    const btn = renderFavorite();
    favorited.value = new Set(['sid']);
    expect(btn.classList.contains('is-favorited')).to.be.true;
    expect(btn.getAttribute('aria-pressed')).to.equal('true');
    expect(btn.getAttribute('aria-label')).to.equal('Favorite Creative Workflows in the Cloud');
  });

  // Milo's auto-tagging runs once at decoration, so a label that changes on toggle would
  // otherwise stay frozen at its first value. Labels match sessions-guide's LiveCard so the
  // two surfaces roll up together in reporting.
  it('tracks add vs remove in daa-ll and updates it on toggle', () => {
    setMetadata('session-id', 'sid');
    const btn = renderFavorite();
    expect(btn.getAttribute('daa-ll')).to.equal('Add-to-Favorites');
    favorited.value = new Set(['sid']);
    expect(btn.getAttribute('daa-ll')).to.equal('Remove-from-Favorites');
    favorited.value = new Set();
    expect(btn.getAttribute('daa-ll')).to.equal('Add-to-Favorites');
  });

  it('shows a register/sign-in toast when favoriting while signed out', async () => {
    setMetadata('session-id', 'sid');
    renderFavorite().click();
    await new Promise((r) => { setTimeout(r); });
    expect(toasts.value[0]?.message).to.match(/register or sign in/i);
  });
});
