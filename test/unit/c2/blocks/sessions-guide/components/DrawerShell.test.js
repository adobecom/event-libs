import { expect } from '@esm-bundle/chai';
import { resolveSessionGuideRequest, DrawerShell } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/DrawerShell.js';
import { SessionGuideContext } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js';

const SESSION = { id: 'session-1', title: 'Building with AI' };

function makeContext(overrides = {}) {
  return {
    sessionsStatusValue: 'ready',
    sessionsValue: [SESSION],
    authValue: { isLoggedIn: null, isRegistered: undefined, userFirstName: null },
    ...overrides,
  };
}

describe('resolveSessionGuideRequest', () => {
  it('returns null for a null request', () => {
    expect(resolveSessionGuideRequest(null, makeContext())).to.be.null;
  });

  it('returns null when sessions are not yet ready (drops requests fired before load)', () => {
    const context = makeContext({ sessionsStatusValue: 'loading' });
    expect(resolveSessionGuideRequest({ sessionId: 'session-1' }, context)).to.be.null;
  });

  it('returns found: false when the sessionId does not match any session', () => {
    const result = resolveSessionGuideRequest({ sessionId: 'nope' }, makeContext());
    expect(result).to.deep.equal({ found: false, sessionId: 'nope' });
  });

  it('resolves the matching session with defaultView live-upcoming when not registered', () => {
    const result = resolveSessionGuideRequest({ sessionId: 'session-1' }, makeContext());
    expect(result).to.deep.equal({ found: true, sessionId: 'session-1', defaultView: 'live-upcoming' });
  });

  it('resolves defaultView my-sessions when the user is registered', () => {
    const context = makeContext({ authValue: { isLoggedIn: true, isRegistered: true, userFirstName: 'Daniel' } });
    const result = resolveSessionGuideRequest({ sessionId: 'session-1' }, context);
    expect(result.defaultView).to.equal('my-sessions');
  });
});

// The drawer and its backdrop must opt out of Milo's Lenis smooth-scroll, which is loaded
// by parallax/rich-content sections and preventDefault()s every wheel and touchmove to
// drive its own virtual scroll — starving every scroll container inside the drawer.
describe('DrawerShell scroll ownership', () => {
  beforeEach(() => {
    SessionGuideContext._current = {
      state: {
        drawerState: 'expanded', activeSessionId: null, activeFilters: {}, activeView: 'live-upcoming', guideConfig: {},
      },
      dispatch: () => {},
    };
  });

  it('marks the drawer and backdrop data-lenis-prevent while open', () => {
    const out = DrawerShell();
    expect(out).to.include('sg-drawer');
    const occurrences = out.split('data-lenis-prevent').length - 1;
    expect(occurrences).to.equal(2);
  });
});
