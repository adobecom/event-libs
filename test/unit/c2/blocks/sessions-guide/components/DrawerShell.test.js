import { expect } from '@esm-bundle/chai';
import { resolveSessionGuideRequest, DrawerShell } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/DrawerShell.js';
import { SessionGuideContext } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js';

const SESSION = {
  id: 'session-1',
  title: 'Building with AI',
  sessionPageUrl: 'https://www.adobe.com/max/2026/sessions/building-with-ai-s001',
};

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
    expect(result).to.deep.equal({
      found: true,
      sessionId: 'session-1',
      sessionParam: 'building-with-ai-s001',
      defaultView: 'live-upcoming',
    });
  });

  it('carries the session id as the param when the session has no page url', () => {
    const context = makeContext({ sessionsValue: [{ id: 'session-1', title: 'No url' }] });
    expect(resolveSessionGuideRequest({ sessionId: 'session-1' }, context).sessionParam)
      .to.equal('session-1');
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

  it('includes the drawer and notification host in one modal subtree', () => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = DrawerShell();
    const modal = wrapper.querySelector('[role="dialog"][aria-modal="true"]');
    const drawer = modal.querySelector('.sg-drawer');
    const host = modal.querySelector('.sg-drawer__notifications');
    expect(modal.classList.contains('sg-shell')).to.be.true;
    expect(modal.getAttribute('aria-label')).to.equal('Sessions guide');
    expect(host).to.exist;
    expect(drawer.contains(host)).to.be.false;
  });
});

describe('DrawerShell FAB placement', () => {
  let frame;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    frame = document.createElement('iframe');
    frame.style.border = '0';
    frame.style.height = '844px';
  });

  afterEach(() => {
    frame.remove();
  });

  [375, 390, 768, 1440].forEach((width) => {
    ['', 'sg-cta-btn--safari-mobile'].forEach((modifier) => {
      it(`places the ${modifier ? 'Mobile Safari' : 'default'} FAB 24px above the viewport bottom at ${width}px`, async () => {
        frame.style.width = `${width}px`;
        await new Promise((resolve, reject) => {
          frame.onload = resolve;
          frame.onerror = reject;
          frame.src = '/test/unit/c2/blocks/sessions-guide/mocks/fab-placement.html';
          document.body.appendChild(frame);
        });

        const button = frame.contentDocument.querySelector('.sg-cta-btn');
        if (modifier) button.classList.add(modifier);
        const style = frame.contentWindow.getComputedStyle(button);
        const bounds = button.getBoundingClientRect();

        expect(frame.contentWindow.innerWidth).to.equal(width);
        expect(style.position).to.equal('fixed');
        expect(style.bottom).to.equal('24px');
        expect(frame.contentWindow.innerHeight - bounds.bottom).to.equal(24);
        expect(bounds.left + bounds.width / 2).to.equal(width / 2);
      });
    });
  });
});
