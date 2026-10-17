import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { guardPlayerScroll } from '../../../../event-libs/v1/c2/utils/player-scroll-guard.js';

function stubLenis(isScrolling = 'smooth') {
  return { isScrolling, animatedScroll: 420, scrollTo: sinon.spy() };
}

function pointer(type, target, init = {}) {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, pointerType: 'mouse', movementX: 4, movementY: 2, ...init,
  }));
}

const wheel = () => window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });
const IDLE = 170; // just past the guard's 150ms wheel-idle window

describe('player-scroll-guard', () => {
  let player;
  let unguard;

  beforeEach(async () => {
    document.body.innerHTML = '<div class="player"><div class="inner"></div></div><div class="outside"></div>';
    player = document.querySelector('.player');
    unguard = guardPlayerScroll(player);
    await wait(IDLE); // let wheel input from a previous test age out
  });

  afterEach(() => {
    unguard();
    delete window.lenis;
    document.body.innerHTML = '';
  });

  it('ends the glide in place when the mouse moves over the player', () => {
    window.lenis = stubLenis();
    pointer('pointermove', player.querySelector('.inner'));
    expect(window.lenis.scrollTo.calledOnceWith(420, { immediate: true })).to.be.true;
  });

  it('also treats pen movement as intent', () => {
    window.lenis = stubLenis();
    pointer('pointermove', player, { pointerType: 'pen' });
    expect(window.lenis.scrollTo.calledOnce).to.be.true;
  });

  it('defers intent shown during wheel input until the wheel goes quiet', async () => {
    window.lenis = stubLenis();
    wheel();
    pointer('pointermove', player);
    expect(window.lenis.scrollTo.called).to.be.false;
    await wait(80);
    wheel(); // momentum still arriving
    await wait(100);
    expect(window.lenis.scrollTo.called).to.be.false;
    await wait(100);
    expect(window.lenis.scrollTo.calledOnce).to.be.true;
  });

  it('drops deferred intent when the pointer leaves the player', async () => {
    window.lenis = stubLenis();
    wheel();
    pointer('pointermove', player);
    player.dispatchEvent(new PointerEvent('pointerleave'));
    await wait(IDLE + 20);
    expect(window.lenis.scrollTo.called).to.be.false;
  });

  it('ends the glide on pointerdown, whatever the pointer type', () => {
    window.lenis = stubLenis();
    pointer('pointerdown', player, { pointerType: 'touch', movementX: 0, movementY: 0 });
    expect(window.lenis.scrollTo.calledOnce).to.be.true;
  });

  it('ignores pointers outside the player', () => {
    window.lenis = stubLenis();
    pointer('pointermove', document.querySelector('.outside'));
    pointer('pointerdown', document.querySelector('.outside'));
    expect(window.lenis.scrollTo.called).to.be.false;
  });

  it('leaves Lenis alone unless it is smooth-scrolling', () => {
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

  it('ignores touch moves and moves without movement', () => {
    window.lenis = stubLenis();
    pointer('pointermove', player, { pointerType: 'touch' });
    pointer('pointermove', player, { movementX: 0, movementY: 0 });
    expect(window.lenis.scrollTo.called).to.be.false;
  });

  it('stops listening, and cancels deferred intent, after cleanup', async () => {
    window.lenis = stubLenis();
    wheel();
    pointer('pointermove', player);
    unguard();
    pointer('pointerdown', player);
    await wait(IDLE + 20);
    expect(window.lenis.scrollTo.called).to.be.false;
  });
});
