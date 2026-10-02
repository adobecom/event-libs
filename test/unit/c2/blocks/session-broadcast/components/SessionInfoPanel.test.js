import { expect } from '@esm-bundle/chai';
import { SessionInfoPanel } from '../../../../../../event-libs/v1/c2/blocks/session-broadcast/components/SessionInfoPanel.js';
import { favorited, pendingActions } from '../../../../../../event-libs/v1/utils/session-store.js';

const SESSION = {
  id: 's-1',
  title: 'Pixel & Product',
  description: 'A session about everything.',
  primaryTrack: 'Design, Imaging & Illustration',
  startTimeUtc: '2026-11-10T18:00:00Z',
  endTimeUtc: '2026-11-10T18:15:00Z',
};

describe('SessionInfoPanel', () => {
  beforeEach(() => {
    favorited.value = new Set();
    pendingActions.value = new Set();
  });

  it('renders nothing when there is no active session', () => {
    expect(SessionInfoPanel({ session: null })).to.equal(null);
  });

  it('renders the session title and description', () => {
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.include('Pixel & Product');
    expect(out).to.include('A session about everything.');
  });

  it('shows Add-to-Favorites when not favorited', () => {
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.include('daa-ll="Add-to-Favorites"');
  });

  it('shows Remove-from-Favorites once favorited', () => {
    favorited.value = new Set(['s-1']);
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.include('daa-ll="Remove-from-Favorites"');
  });

  // Collapsed has two Figma variants of its own (node 9935:12816 not-favorited vs 4975:45446
  // favorited) — mobile hides the description entirely while collapsed+favorited; tablet
  // always shows it (per follow-up request). The description now always renders in the DOM;
  // session-broadcast.css's `.is-favorited` rules do the actual hiding on mobile only, keyed
  // off this `is-favorited` class — untestable here (CSS, not JS), verified in a real browser.
  it('shows the description when collapsed and not favorited', () => {
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.include('sb-info__desc-wrap');
    expect(out).to.include('A session about everything.');
    expect(out).to.not.include('is-favorited');
  });

  it('still renders the description when collapsed and favorited — marks is-favorited for CSS', () => {
    favorited.value = new Set(['s-1']);
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.include('sb-info__desc-wrap');
    expect(out).to.include('A session about everything.');
    expect(out).to.include('is-favorited');
  });

  it('shows the badge row wrapper when collapsed and not favorited', () => {
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.include('sb-info__meta');
  });

  it('omits the session duration without removing the badge row', () => {
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.include('sb-info__meta');
    expect(out).to.not.include('sb-info__time');
    expect(out).to.not.include('15m');
  });

  it('still renders the badge row wrapper when collapsed and favorited — marks is-favorited for CSS', () => {
    favorited.value = new Set(['s-1']);
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.include('sb-info__meta');
    expect(out).to.include('is-favorited');
  });

  it('shows a Share action alongside Favorite', () => {
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.include('daa-ll="Share"');
  });

  // The caret/expand toggle uses local component state, which the mocked htm-preact's
  // useState setter no-ops (see test/unit/mocks/deps/htm-preact.js) — the expanded branch
  // (track badge, untruncated description, "view all details" CTA) can't be reached
  // through this string-render harness. Collapsed is the only state testable here;
  // expand/collapse itself is verified via a preview harness in a real browser instead.
  it('starts collapsed — no "view all details" CTA until expanded', () => {
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.not.include('sb-info__view-all');
  });

  it('never shows an Add-to-Schedule CTA — the active session is always already live', () => {
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.not.include('Add-to-Schedule');
  });
});
