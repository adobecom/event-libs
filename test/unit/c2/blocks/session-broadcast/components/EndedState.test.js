import { expect } from '@esm-bundle/chai';
import { EndedState } from '../../../../../../event-libs/v1/c2/blocks/session-broadcast/components/EndedState.js';
import { favorited, pendingActions } from '../../../../../../event-libs/v1/utils/session-store.js';

const SESSION = {
  id: 's-1',
  title: 'Pixel & Product',
  description: 'A session about everything.',
  sessionPageUrl: '/s/pixel-and-product',
  primaryTrack: 'Design, Imaging & Illustration',
  startTimeUtc: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
  endTimeUtc: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
};

describe('EndedState', () => {
  beforeEach(() => {
    favorited.value = new Set();
    pendingActions.value = new Set();
  });

  it('renders nothing when there is no ended session', () => {
    expect(EndedState({ session: null })).to.equal(null);
  });

  it('renders the "Session complete." eyebrow and title', () => {
    const out = EndedState({ session: SESSION });
    expect(out).to.include('Session complete.');
    expect(out).to.include('Pixel & Product');
  });

  // Meta (badges/duration), description, and "View more" were removed per Figma 8454:54024
  // (mobile) / 8454:54044 (tablet), reused as-is at desktop/desktop-xl — the marquee is now just
  // eyebrow, title, and actions, regardless of whether the session has a description.
  it('never renders the meta row, description, or "View more" toggle', () => {
    const out = EndedState({ session: SESSION });
    expect(out).to.not.include('sb-ended__meta');
    expect(out).to.not.include('sb-ended__time');
    expect(out).to.not.include('sb-ended__desc');
    expect(out).to.not.include('sb-ended__view-more');
    expect(out).to.not.include('A session about everything.');
  });

  it('renders a Watch on demand link to the session page', () => {
    const out = EndedState({ session: SESSION });
    expect(out).to.include('sb-ended__watch');
    expect(out).to.include('href="/s/pixel-and-product"');
    expect(out).to.include('Watch on demand');
  });

  it('omits the Watch on demand link when there is no session page URL', () => {
    const out = EndedState({ session: { ...SESSION, sessionPageUrl: '' } });
    expect(out).to.not.include('sb-ended__watch');
  });

  it('shows Add-to-Favorites when not favorited', () => {
    const out = EndedState({ session: SESSION });
    expect(out).to.include('daa-ll="Add-to-Favorites"');
  });

  it('shows Remove-from-Favorites once favorited', () => {
    favorited.value = new Set(['s-1']);
    const out = EndedState({ session: SESSION });
    expect(out).to.include('daa-ll="Remove-from-Favorites"');
  });

  it('never shows an Add-to-Schedule CTA — the session already aired', () => {
    const out = EndedState({ session: SESSION });
    expect(out).to.not.include('Add-to-Schedule');
  });

  it('shows a Share action alongside Favorite', () => {
    const out = EndedState({ session: SESSION });
    expect(out).to.include('daa-ll="Share"');
  });
});
