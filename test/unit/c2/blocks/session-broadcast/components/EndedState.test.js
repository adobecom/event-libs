import { expect } from '@esm-bundle/chai';
import { EndedState } from '../../../../../../event-libs/v1/c2/blocks/session-broadcast/components/EndedState.js';
import { favorited, pendingActions } from '../../../../../../event-libs/v1/utils/session-store.js';

const SESSION = {
  id: 's-1',
  title: 'Pixel & Product',
  description: 'A session about everything.',
  sessionPageUrl: '/s/pixel-and-product',
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
});
