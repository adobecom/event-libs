import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { guardPlayerScroll } from '../../../../event-libs/v1/c2/utils/player-scroll-guard.js';

function stubLenis(isScrolling = 'smooth', isLocked = false) {
  return { isScrolling, isLocked, stop: sinon.spy(), start: sinon.spy() };
}

function pointer(type, target, init = {}) {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, pointerType: 'mouse', movementX: 4, movementY: 2, ...init,
  }));
}

const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

describe('player-scroll-guard', () => {
  let player;
  let unguard;

  beforeEach(async () => {
    document.body.innerHTML = '<div class="player"><div class="inner"></div></div><div class="outside"></div>';
    player = document.querySelector('.player');
    unguard = guardPlayerScroll(player);
    // Let any wheel timestamp from a previous test age out.
    await wait(160);
  });

  afterEach(() => {
    unguard();
    delete window.lenis;
    document.body.innerHTML = '';
  });

  it('ends a smooth glide when the mouse moves over the player', () => {
    window.lenis = stubLenis();
    pointer('pointermove', player.querySelector('.inner'));
    expect(window.lenis.stop.calledOnce).to.be.true;
    expect(window.lenis.start.calledOnce).to.be.true;
    expect(window.lenis.stop.calledBefore(window.lenis.start)).to.be.true;
  });

  it('ends a smooth glide on pointerdown, whatever the pointer type', () => {
    window.lenis = stubLenis();
    pointer('pointerdown', player, { pointerType: 'touch', movementX: 0, movementY: 0 });
    expect(window.lenis.stop.calledOnce).to.be.true;
  });

  it('ignores pointers outside the player', () => {
    window.lenis = stubLenis();
    pointer('pointermove', document.querySelector('.outside'));
    pointer('pointerdown', document.querySelector('.outside'));
    expect(window.lenis.stop.called).to.be.false;
  });

  it('leaves Lenis alone unless it is smooth-scrolling and unlocked', () => {
    window.lenis = stubLenis(false);
    pointer('pointerdown', player);
    window.lenis.isScrolling = 'native';
    pointer('pointerdown', player);
    window.lenis = stubLenis('smooth', true);
    pointer('pointerdown', player);
    expect(window.lenis.stop.called).to.be.false;
  });

  it('does nothing without Lenis', () => {
    expect(() => pointer('pointerdown', player)).not.to.throw();
  });

  it('ignores non-mouse moves and moves without movement', () => {
    window.lenis = stubLenis();
    pointer('pointermove', player, { pointerType: 'touch' });
    pointer('pointermove', player, { movementX: 0, movementY: 0 });
    expect(window.lenis.stop.called).to.be.false;
  });

  it('ignores mouse moves while wheel input is still arriving', async () => {
    window.lenis = stubLenis();
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
    pointer('pointermove', player);
    expect(window.lenis.stop.called).to.be.false;
    await wait(160);
    pointer('pointermove', player);
    expect(window.lenis.stop.calledOnce).to.be.true;
  });

  it('stops listening after cleanup', () => {
    window.lenis = stubLenis();
    unguard();
    pointer('pointerdown', player);
    expect(window.lenis.stop.called).to.be.false;
  });
});
