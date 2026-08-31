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

  it('renders the "Session ended." eyebrow, title, and description', () => {
    const out = EndedState({ session: SESSION });
    expect(out).to.include('Session ended.');
    expect(out).to.include('Pixel & Product');
    expect(out).to.include('A session about everything.');
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

  // CategoryBadge is a nested custom component — the mocked htm-preact used here doesn't
  // resolve those (see test/unit/mocks/deps/htm-preact.js), so only the meta row's own
  // wrapper and the duration span (rendered directly by EndedState) are checkable here.
  it('shows the meta row with the session duration', () => {
    const out = EndedState({ session: SESSION });
    expect(out).to.include('sb-ended__meta');
    expect(out).to.include('sb-ended__time');
    expect(out).to.include('1h');
  });

  it('shows a Share action alongside Favorite', () => {
    const out = EndedState({ session: SESSION });
    expect(out).to.include('daa-ll="Share"');
  });

  // The "View more"/"View less" toggle uses local component state, which the mocked
  // htm-preact's useState setter no-ops (see test/unit/mocks/deps/htm-preact.js) — expanding
  // can't be reached through this string-render harness. Collapsed is the only state
  // testable here; the toggle itself is verified via a preview harness in a real browser.
  it('starts collapsed with a "View more" toggle when a description is present', () => {
    const out = EndedState({ session: SESSION });
    expect(out).to.include('sb-ended__view-more');
    expect(out).to.include('View more');
    expect(out).to.not.include('View less');
  });

  it('omits the description wrap and toggle when there is no description', () => {
    const out = EndedState({ session: { ...SESSION, description: '' } });
    expect(out).to.not.include('sb-ended__desc-wrap');
    expect(out).to.not.include('sb-ended__view-more');
  });
});
