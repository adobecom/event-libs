import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import { renderFavorite } from '../../../../../event-libs/v1/c2/blocks/session-details/favorite.js';
import { favorited, sessions, auth } from '../../../../../event-libs/v1/utils/session-store.js';
import { toast } from '../../../../../event-libs/v1/features/toast/toast.js';

describe('session-details favorite', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    favorited.value = new Set();
    sessions.value = [];
    auth.value = { isLoggedIn: null, isRegistered: undefined, userFirstName: null };
    toast.value = null;
  });

  it('returns null without a session id', () => {
    expect(renderFavorite()).to.be.null;
  });

  it('renders an outline heart button', () => {
    setMetadata('session-id', 'sid');
    const btn = renderFavorite();
    expect(btn.classList.contains('session-favorite')).to.be.true;
    expect(btn.getAttribute('aria-pressed')).to.equal('false');
    expect(btn.getAttribute('aria-label')).to.equal('Add to favorites');
    expect(btn.querySelector('svg')).to.not.be.null;
  });

  it('reflects the favorited signal', () => {
    setMetadata('session-id', 'sid');
    const btn = renderFavorite();
    favorited.value = new Set(['sid']);
    expect(btn.classList.contains('is-favorited')).to.be.true;
    expect(btn.getAttribute('aria-pressed')).to.equal('true');
    expect(btn.getAttribute('aria-label')).to.equal('Remove from favorites');
  });

  it('shows a login toast when favoriting while signed out', async () => {
    setMetadata('session-id', 'sid');
    renderFavorite().click();
    await new Promise((r) => { setTimeout(r); });
    expect(toast.value?.message).to.match(/login/i);
  });
});
