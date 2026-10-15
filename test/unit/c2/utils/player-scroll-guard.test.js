import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

const MODULE = '../../../../event-libs/v1/c2/utils/player-scroll-guard.js?';
let counter = 0;

// The module installs its listeners once, so each test imports (and installs) a fresh copy.
async function freshGuard() {
  counter += 1;
  return import(`${MODULE}${counter}`);
}

function stubLenis(isScrolling = 'smooth') {
  return { isScrolling, animatedScroll: 420, scrollTo: sinon.spy() };
}

function pointer(type, target, init = {}) {
  const event = new PointerEvent(type, {
    bubbles: true, pointerType: 'mouse', movementX: 4, movementY: 2, ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe('player-scroll-guard', () => {
  let player;
  let outside;
  const cleanups = [];

  beforeEach(async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = `
      <div class="sb-player__mount"><div class="inner"></div></div>
      <div class="outside"></div>`;
    player = document.querySelector('.sb-player__mount .inner');
    outside = document.querySelector('.outside');
    const { installPlayerScrollGuard } = await freshGuard();
    const addWindow = sinon.spy(window, 'addEventListener');
    const addDocument = sinon.spy(document, 'addEventListener');
    installPlayerScrollGuard();
    installPlayerScrollGuard();
    addWindow.getCalls().forEach(({ args }) => cleanups.push(() => window.removeEventListener(...args)));
    addDocument.getCalls().forEach(({ args }) => cleanups.push(() => document.removeEventListener(...args)));
    addWindow.restore();
    addDocument.restore();
  });

  afterEach(() => {
    cleanups.splice(0).forEach((fn) => fn());
    delete window.lenis;
    document.body.innerHTML = '';
  });

  it('installs its listeners only once', () => {
    expect(cleanups).to.have.length(3);
  });

  it('halts a smooth glide in place when the pointer moves over a player', () => {
    window.lenis = stubLenis();
    pointer('pointermove', player);
    expect(window.lenis.scrollTo.calledOnceWith(420, { immediate: true })).to.be.true;
  });

  it('halts a smooth glide on pointerdown over a player', () => {
    window.lenis = stubLenis();
    pointer('pointerdown', player, { movementX: 0, movementY: 0 });
    expect(window.lenis.scrollTo.calledOnce).to.be.true;
  });

  it('ignores pointers outside a player', () => {
    window.lenis = stubLenis();
    pointer('pointermove', outside);
    pointer('pointerdown', outside);
    expect(window.lenis.scrollTo.called).to.be.false;
  });

  it('does nothing unless Lenis is smooth-scrolling', () => {
    window.lenis = stubLenis(false);
    pointer('pointermove', player);
    window.lenis.isScrolling = 'native';
    pointer('pointerdown', player);
    expect(window.lenis.scrollTo.called).to.be.false;
  });

  it('does nothing without Lenis', () => {
    expect(() => {
      pointer('pointermove', player);
      pointer('pointerdown', player);
    }).not.to.throw();
  });

  it('ignores pointermove with no movement (scroll-synthesised) or from touch', () => {
    window.lenis = stubLenis();
    pointer('pointermove', player, { movementX: 0, movementY: 0 });
    pointer('pointermove', player, { pointerType: 'touch' });
    expect(window.lenis.scrollTo.called).to.be.false;
  });

  it('ignores pointermove right after a wheel event (still mid-scroll)', () => {
    window.lenis = stubLenis();
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
    pointer('pointermove', player);
    expect(window.lenis.scrollTo.called).to.be.false;
  });
});
