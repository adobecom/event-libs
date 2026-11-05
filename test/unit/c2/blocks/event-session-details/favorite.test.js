import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import { renderFavorite } from '../../../../../event-libs/v1/c2/blocks/event-session-details/favorite.js';
import {
  favorited, sessions, sessionsStatus, auth, initSessionState,
} from '../../../../../event-libs/v1/utils/session-store.js';
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

  it('renders an outline heart button', () => {
    setMetadata('session-id', 'sid');
    const btn = renderFavorite();
    expect(btn.classList.contains('session-favorite')).to.be.true;
    expect(btn.getAttribute('aria-pressed')).to.equal('false');
    // Name stays constant; aria-pressed carries the state (avoids double announcement).
    expect(btn.getAttribute('aria-label')).to.equal('Favorite this session');
    expect(btn.querySelector('svg')).to.not.be.null;
  });

  it('reflects the favorited signal', () => {
    setMetadata('session-id', 'sid');
    const btn = renderFavorite();
    favorited.value = new Set(['sid']);
    expect(btn.classList.contains('is-favorited')).to.be.true;
    expect(btn.getAttribute('aria-pressed')).to.equal('true');
    expect(btn.getAttribute('aria-label')).to.equal('Favorite this session');
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

  it('hydrates from a representative time card and follows catalog replacement', () => {
    setMetadata('session-id', 'sid');
    const btn = renderFavorite();
    favorited.value = new Set(['sid']);
    sessions.value = [
      { id: 'sid', sessionId: 'sid', sessionTimeId: 'first-time', rfSessionId: 'rf-session' },
      { id: 'sid', sessionId: 'sid', sessionTimeId: 'second-time', rfSessionId: 'rf-session' },
    ];
    expect(btn.getAttribute('aria-pressed')).to.equal('true');
    expect(btn.getAttribute('daa-ll')).to.equal('Remove-from-Favorites');
    sessions.value = [{ id: 'sid', sessionId: 'sid', sessionTimeId: 'replacement-time', rfSessionId: 'rf-session' }];
    expect(btn.getAttribute('aria-pressed')).to.equal('true');
    favorited.value = new Set();
    expect(btn.getAttribute('aria-pressed')).to.equal('false');
  });

  it('toggles the current representative card using its session-level RF identity', async () => {
    const fetchStub = sinon.stub(window, 'fetch').callsFake(async () => ({
      ok: true,
      json: async () => ({ sessions: [], sessionTimes: [], responseCode: '0' }),
    }));
    try {
      setMetadata('tier-1-event-config', JSON.stringify({ eventId: 'favorite-repeat' }));
      initSessionState();
      if (sessionsStatus.value !== 'ready') {
        await new Promise((resolve) => {
          const unsubscribe = sessionsStatus.subscribe((status) => {
            if (status !== 'ready') return;
            unsubscribe();
            resolve();
          });
        });
      }
      setMetadata('session-id', 'sid');
      auth.value = { isLoggedIn: true, isRegistered: true };
      sessions.value = [{ id: 'sid', sessionId: 'sid', sessionTimeId: 'old-time', rfSessionId: 'old-session' }];
      const btn = renderFavorite();
      const cards = [
        { id: 'sid', sessionId: 'sid', sessionTimeId: 'first-time', rfSessionId: 'current-session' },
        { id: 'sid', sessionId: 'sid', sessionTimeId: 'second-time', rfSessionId: 'current-session' },
      ];
      sessions.value = cards;
      favorited.value = new Set(cards.map((s) => s.id));
      fetchStub.resetHistory();
      btn.click();
      await new Promise((resolve) => { setTimeout(resolve); });
      const request = fetchStub.getCalls().find((call) => call.args[0].includes('toggleSessionInterest'));
      expect(new URL(request.args[0]).searchParams.get('sessionId')).to.equal('current-session');
      expect(favorited.value.size).to.equal(0);
      expect(btn.getAttribute('aria-pressed')).to.equal('false');
      expect(toasts.value[0]?.message).to.equal('Removed from favorites');
    } finally {
      fetchStub.restore();
    }
  });
});
