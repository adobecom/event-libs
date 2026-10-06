import { expect } from '@esm-bundle/chai';
import { executeServerCommand } from '@web/test-runner-commands';
import { resolveSessionGuideRequest, DrawerShell } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/DrawerShell.js';
import { DrawerHeader } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/DrawerHeader.js';
import { buildInitialState, SessionGuideContext } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js';
import { auth, sessionsStatus } from '../../../../../../event-libs/v1/utils/session-store.js';

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

describe('DrawerShell collapsed visibility', () => {
  let frame;
  let previousAuth;
  let previousStatus;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    previousAuth = auth.value;
    previousStatus = sessionsStatus.value;
    auth.value = { isLoggedIn: false, isRegistered: false, userFirstName: null };
    sessionsStatus.value = 'loading';
    frame = document.createElement('iframe');
    frame.style.border = '0';
    frame.style.height = '874px';
  });

  afterEach(() => {
    frame.remove();
    auth.value = previousAuth;
    sessionsStatus.value = previousStatus;
    SessionGuideContext._current = null;
  });

  [375, 402, 768, 1279, 1280, 1440].forEach((width) => {
    it(`hides the collapsed heading independently of drawer coordinates at ${width}px`, async () => {
      frame.style.width = `${width}px`;
      await new Promise((resolve, reject) => {
        frame.onload = resolve;
        frame.onerror = reject;
        frame.src = '/test/unit/c2/blocks/sessions-guide/mocks/fab-placement.html';
        document.body.appendChild(frame);
      });

      const doc = frame.contentDocument;
      const portal = doc.querySelector('.sg-portal');
      const state = buildInitialState({
        headings: { loggedOut: 'Unregistered, find more inspiration' },
      });
      SessionGuideContext._current = { state, dispatch: () => {} };

      ['hidden', 'expanded', 'hidden', 'peek', 'expanded', 'hidden'].forEach((drawerState) => {
        state.drawerState = drawerState;
        portal.innerHTML = DrawerShell();
        const drawer = portal.querySelector('.sg-drawer');
        drawer.insertAdjacentHTML('afterbegin', DrawerHeader({}));
        // Simulate a stale viewport offset: closed content must not rely on being off-screen.
        drawer.style.top = drawerState === 'peek' ? '40%' : '0px';
        const style = frame.contentWindow.getComputedStyle(drawer);
        const heading = drawer.querySelector('.sg-header-title');
        const cta = portal.querySelector('.sg-cta-btn');

        expect(heading.textContent).to.equal('Unregistered, find more inspiration');
        expect(heading.getBoundingClientRect().top).to.be.lessThan(frame.contentWindow.innerHeight);
        expect(style.opacity).to.equal(drawerState === 'hidden' ? '0' : '1');
        expect(drawer.hasAttribute('inert')).to.equal(drawerState === 'hidden');
        const shell = portal.querySelector('.sg-shell');
        expect(shell.getAttribute('role')).to.equal(drawerState === 'hidden' ? null : 'dialog');
        expect(shell.getAttribute('aria-modal')).to.equal(drawerState === 'hidden' ? null : 'true');
        expect(drawer.hasAttribute('role')).to.be.false;
        expect(!!cta).to.equal(drawerState === 'hidden');
        if (cta) expect(frame.contentWindow.getComputedStyle(cta).opacity).to.equal('1');
      });
    });
  });
});

describe('DrawerShell real Preact lifecycle', () => {
  let frame;

  beforeEach(async () => {
    await executeServerCommand('focus-test-page');
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    frame = document.createElement('iframe');
    frame.style.border = '0';
    frame.style.height = '874px';
  });

  afterEach(() => {
    frame.remove();
  });

  [
    { width: 402, reducedMotion: false },
    { width: 1440, reducedMotion: false },
    { width: 402, reducedMotion: true },
  ].forEach(({ width, reducedMotion }) => {
    it(`preserves closing motion and restores visibility on reopen at ${width}px, reduced motion: ${reducedMotion}`, async () => {
      frame.style.width = `${width}px`;
      await new Promise((resolve, reject) => {
        frame.onload = resolve;
        frame.onerror = reject;
        frame.src = '/test/unit/c2/blocks/sessions-guide/mocks/fab-placement.html';
        document.body.appendChild(frame);
      });

      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      win.drawerTestReducedMotion = reducedMotion;
      const importMap = doc.createElement('script');
      importMap.type = 'importmap';
      importMap.textContent = JSON.stringify({
        imports: { '/event-libs/v1/deps/htm-preact.js': '/event-libs/v1/deps/htm-preact.js?real-preact=true' },
      });
      doc.head.append(importMap);
      await new Promise((resolve, reject) => {
        win.addEventListener('drawer-test-ready', resolve, { once: true });
        win.addEventListener('error', (event) => reject(event.error || new Error(event.message)), { once: true });
        const script = doc.createElement('script');
        script.type = 'module';
        script.src = '/test/unit/c2/blocks/sessions-guide/mocks/drawer-lifecycle.js';
        script.onerror = reject;
        doc.head.append(script);
      });

      const drawer = doc.querySelector('.sg-drawer');
      const style = () => win.getComputedStyle(drawer);
      const settle = () => new Promise((resolve) => win.setTimeout(resolve, 550));
      expect(style().opacity).to.equal('0');

      doc.querySelector('.sg-cta-btn').click();
      await settle();
      expect(style().opacity).to.equal('1');
      expect(drawer.inert).to.be.false;
      expect(doc.body.style.overflow).to.equal('hidden');
      const modal = doc.querySelector('[role="dialog"][aria-modal="true"]');
      expect(modal.classList.contains('sg-shell')).to.be.true;
      expect(modal.contains(drawer)).to.be.true;
      expect(modal.querySelector('.sg-drawer__notifications')).to.exist;

      doc.querySelector('.sg-close-btn').click();
      await new Promise((resolve) => win.requestAnimationFrame(resolve));
      expect(drawer.inert).to.be.true;
      expect(style().opacity).to.equal(reducedMotion ? '0' : '1');
      if (!reducedMotion) {
        expect(style().transitionDuration).to.equal('0.45s, 0s');
        expect(style().transitionDelay).to.equal('0s, 0.45s');
      }
      await settle();
      expect(style().opacity).to.equal('0');
      expect(doc.body.style.overflow).to.equal('');
      expect(doc.querySelector('[role="dialog"]')).to.be.null;

      drawer.style.transition = 'none';
      drawer.style.top = '0px';
      expect(style().opacity).to.equal('0');
      doc.querySelector('.sg-cta-btn').click();
      await settle();
      expect(style().opacity).to.equal('1');
      expect(drawer.inert).to.be.false;
    }).timeout(10000);
  });
});
