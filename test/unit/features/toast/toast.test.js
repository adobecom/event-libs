import { expect } from '@esm-bundle/chai';

import {
  toast, showToast, hideToast, mountToast,
} from '../../../../event-libs/v1/features/toast/toast.js';

// mountToast() is an idempotent, page-level singleton by design (mirrors
// initSessionState()'s `initialized` guard) — it's meant to be called once per page
// load, so unlike component tests this file doesn't reset document.body between tests.
describe('utils/toast', () => {
  beforeEach(() => {
    toast.value = null;
  });

  it('showToast sets the toast signal with defaults', () => {
    showToast({ message: 'Hi' });
    expect(toast.value.message).to.equal('Hi');
    expect(toast.value.variant).to.equal('neutral');
    expect(toast.value.duration).to.equal(1500);
    expect(toast.value.id).to.be.a('number');
  });

  it('showToast honors explicit variant/cta/duration', () => {
    const ctaAction = () => {};
    showToast({
      message: 'Login required', variant: 'informative', ctaLabel: 'Login', ctaAction, duration: null,
    });
    expect(toast.value.variant).to.equal('informative');
    expect(toast.value.ctaLabel).to.equal('Login');
    expect(toast.value.ctaAction).to.equal(ctaAction);
    expect(toast.value.duration).to.be.null;
  });

  it('hideToast clears the signal', () => {
    showToast({ message: 'Hi' });
    hideToast();
    expect(toast.value).to.be.null;
  });

  describe('mountToast', () => {
    let el;

    before(() => {
      mountToast();
      el = document.body.querySelector('.sg-toast');
    });

    it('mounts a single toast element to document.body', () => {
      expect(el).to.exist;
      expect(el.hidden).to.be.true;
    });

    it('is idempotent — calling it again does not duplicate the element', () => {
      mountToast();
      expect(document.body.querySelectorAll('.sg-toast')).to.have.lengthOf(1);
    });

    it('renders the message and reveals the element when the signal is set', () => {
      showToast({ message: 'Added to schedule', variant: 'positive' });
      expect(el.hidden).to.be.false;
      expect(el.classList.contains('sg-toast--positive')).to.be.true;
      expect(el.textContent).to.include('Added to schedule');
    });

    it('renders a CTA link when ctaHref is provided', () => {
      showToast({ message: 'Register', ctaLabel: 'Register now', ctaHref: '/register' });
      const cta = el.querySelector('.sg-toast__cta');
      expect(cta.tagName).to.equal('A');
      expect(cta.getAttribute('href')).to.equal('/register');
      expect(cta.textContent).to.equal('Register now');
    });

    it('renders a CTA button and wires ctaAction when ctaHref is absent', () => {
      let called = false;
      showToast({ message: 'Login required', ctaLabel: 'Login', ctaAction: () => { called = true; } });
      const cta = el.querySelector('.sg-toast__cta');
      expect(cta.tagName).to.equal('BUTTON');
      cta.click();
      expect(called).to.be.true;
    });

    it('clears the signal once the exit transition ends', () => {
      showToast({ message: 'Bye' });
      el.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'transform' }));
      // Wrong property — should be ignored, toast stays visible.
      expect(toast.value).to.not.be.null;

      el.classList.remove('sg-toast--visible');
      el.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'opacity' }));
      expect(el.hidden).to.be.true;
      expect(toast.value).to.be.null;
    });
  });
});
