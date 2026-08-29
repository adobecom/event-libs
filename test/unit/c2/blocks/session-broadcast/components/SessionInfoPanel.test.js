import { expect } from '@esm-bundle/chai';
import { SessionInfoPanel } from '../../../../../../event-libs/v1/c2/blocks/session-broadcast/components/SessionInfoPanel.js';
import { favorited, pendingActions } from '../../../../../../event-libs/v1/utils/session-store.js';

const HOUR = 3600e3;

const SESSION = {
  id: 's-1',
  title: 'Pixel & Product',
  description: 'A session about everything.',
  startTimeUtc: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  endTimeUtc: new Date(Date.now() + HOUR).toISOString(),
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

  it('renders a duration label when the session has an end time', () => {
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.include('sb-info__duration');
  });

  it('omits the duration label when there is no end time', () => {
    const out = SessionInfoPanel({ session: { ...SESSION, endTimeUtc: null } });
    expect(out).to.not.include('sb-info__duration');
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

  // The caret/expand toggle uses local component state, which the mocked htm-preact's
  // useState setter no-ops (see test/unit/mocks/deps/htm-preact.js) — the expanded branch
  // (the "view all details" CTA) can't be reached through this string-render harness.
  // Collapsed is the only state testable here; expand/collapse itself is verified via a
  // preview harness in a real browser instead.
  it('starts collapsed — no "view all details" CTA until expanded', () => {
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.not.include('sb-info__view-all');
  });

  it('never shows an Add-to-Schedule CTA — the active session is always already live', () => {
    const out = SessionInfoPanel({ session: SESSION });
    expect(out).to.not.include('Add-to-Schedule');
  });
});
