import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

import {
  toasts, showToast, hideToast, mountToast,
} from '../../../../event-libs/v1/features/toast/toast.js';

async function nextFrames(n = 2) {
  for (let i = 0; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

describe('features/toast', () => {
  beforeEach(() => {
    toasts.value = [];
  });

  describe('showToast / hideToast (queue)', () => {
    it('adds a toast to the front of the queue with defaults', () => {
      const id = showToast({ message: 'Hi' });
      expect(toasts.value).to.have.lengthOf(1);
      expect(toasts.value[0]).to.include({
        id, message: 'Hi', variant: 'neutral', duration: 5000,
      });
    });

    it('honors an explicit variant', () => {
      showToast({ message: 'Hi', variant: 'positive' });
      expect(toasts.value[0].variant).to.equal('positive');
    });

    it('clamps an explicit duration below 5000ms up to the floor', () => {
      showToast({ message: 'Hi', duration: 200 });
      expect(toasts.value[0].duration).to.equal(5000);
    });

    it('keeps duration null when explicitly passed null', () => {
      showToast({ message: 'Hi', duration: null });
      expect(toasts.value[0].duration).to.be.null;
    });

    it('forces duration null for an actionable (ctaLabel) toast, regardless of what was passed', () => {
      showToast({
        message: 'Login required', ctaLabel: 'Login', ctaAction: () => {}, duration: 1000,
      });
      expect(toasts.value[0].duration).to.be.null;
    });

    it('stacks multiple toasts, newest at the front of the queue', () => {
      showToast({ message: 'First' });
      showToast({ message: 'Second' });
      expect(toasts.value).to.have.lengthOf(2);
      expect(toasts.value[0].message).to.equal('Second');
      expect(toasts.value[1].message).to.equal('First');
    });

    it('hideToast(id) removes only the matching toast', () => {
      const firstId = showToast({ message: 'First' });
      showToast({ message: 'Second' });
      hideToast(firstId);
      expect(toasts.value).to.have.lengthOf(1);
      expect(toasts.value[0].message).to.equal('Second');
    });

    it('hideToast() with no id clears the whole queue', () => {
      showToast({ message: 'First' });
      showToast({ message: 'Second' });
      hideToast();
      expect(toasts.value).to.have.lengthOf(0);
    });
  });

  describe('mountToast (rendering)', () => {
    let region;

    before(() => {
      mountToast();
      region = document.body.querySelector('.sg-toast-region');
    });

    it('mounts a single landmark region to document.body', () => {
      expect(region).to.exist;
      expect(region.getAttribute('role')).to.equal('region');
      expect(region.getAttribute('aria-label')).to.equal('0 notifications');
    });

    it('is idempotent — calling it again does not duplicate the region', () => {
      mountToast();
      expect(document.body.querySelectorAll('.sg-toast-region')).to.have.lengthOf(1);
    });

    it('renders a toast element per queue entry and keeps the aria-label count in sync', () => {
      showToast({ message: 'Added to schedule', variant: 'positive' });
      showToast({ message: 'Removed from favorites', variant: 'neutral' });
      expect(region.querySelectorAll('.sg-toast')).to.have.lengthOf(2);
      expect(region.getAttribute('aria-label')).to.equal('2 notifications');

      const [older, newer] = region.querySelectorAll('.sg-toast');
      expect(older.textContent).to.include('Added to schedule');
      expect(newer.textContent).to.include('Removed from favorites');
      expect(newer.classList.contains('sg-toast--neutral')).to.be.true;
    });

    it('sets alertdialog/status roles and reveals content to assistive tech after mount', async () => {
      // Real rAF can be suspended indefinitely on a backgrounded page when many WTR sessions
      // share a browser (see profile-cards.test.js's own stubRaf note) — stub it so the
      // double-rAF reveal in mountToast() resolves deterministically instead of racing that.
      const raf = sinon.stub(window, 'requestAnimationFrame').callsFake((cb) => setTimeout(cb, 0));
      try {
        showToast({ message: 'Link copied', variant: 'positive' });
        const el = region.querySelector('.sg-toast');
        expect(el.getAttribute('role')).to.equal('alertdialog');
        expect(el.getAttribute('tabindex')).to.equal('0');

        const content = el.querySelector('.sg-toast__body');
        expect(content.getAttribute('role')).to.equal('status');
        expect(content.getAttribute('aria-hidden')).to.equal('true');

        await nextFrames();
        expect(el.classList.contains('sg-toast--visible')).to.be.true;
        expect(content.hasAttribute('aria-hidden')).to.be.false;
      } finally {
        raf.restore();
      }
    });

    it('uses role="status" (polite) for informative/positive/neutral, reserving role="alert" (assertive) for negative', () => {
      showToast({ message: 'Register or sign in to favorite.', variant: 'informative' });
      showToast({ message: 'Added to favorites', variant: 'positive' });
      showToast({ message: 'Removed from favorites', variant: 'neutral' });
      showToast({ message: 'Something went wrong. Please try again.', variant: 'negative' });

      const bodies = [...region.querySelectorAll('.sg-toast__body')];
      const roleByVariant = Object.fromEntries(
        bodies.map((body) => [body.closest('.sg-toast').className.match(/sg-toast--(\w+)/)[1], body.getAttribute('role')]),
      );
      expect(roleByVariant).to.deep.equal({
        informative: 'status', positive: 'status', neutral: 'status', negative: 'alert',
      });
    });

    it('renders a CTA link inline in the body when ctaHref is provided', () => {
      showToast({ message: 'Register', ctaLabel: 'Register now', ctaHref: '/register' });
      const el = region.querySelector('.sg-toast');
      const cta = el.querySelector('.sg-toast__body .sg-toast__cta');
      expect(cta.tagName).to.equal('A');
      expect(cta.getAttribute('href')).to.equal('/register');
      expect(cta.textContent).to.equal('Register now');
    });

    it('renders a CTA button and wires ctaAction when ctaHref is absent', () => {
      let called = false;
      showToast({ message: 'Login required', ctaLabel: 'Login', ctaAction: () => { called = true; } });
      const el = region.querySelector('.sg-toast');
      const cta = el.querySelector('.sg-toast__body .sg-toast__cta');
      expect(cta.tagName).to.equal('BUTTON');
      cta.click();
      expect(called).to.be.true;
    });

    it('clicking close starts the exit transition, then removes the toast once it ends', () => {
      showToast({ message: 'Bye' });
      const el = region.querySelector('.sg-toast');
      el.classList.add('sg-toast--visible');

      el.querySelector('.sg-toast__close').click();
      expect(el.classList.contains('sg-toast--visible')).to.be.false;
      expect(document.body.contains(el)).to.be.true;
      expect(toasts.value).to.have.lengthOf(1);

      el.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'transform' }));
      // Wrong property — should be ignored, toast stays.
      expect(document.body.contains(el)).to.be.true;

      el.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'opacity' }));
      expect(document.body.contains(el)).to.be.false;
      expect(toasts.value).to.have.lengthOf(0);
    });

    it('hideToast(id) called directly removes the toast immediately, without an exit transition', () => {
      const id = showToast({ message: 'Bye' });
      const el = region.querySelector('.sg-toast');
      hideToast(id);
      expect(document.body.contains(el)).to.be.false;
      expect(toasts.value).to.have.lengthOf(0);
    });

    it('pauses every visible toast timer while the region is hovered or focused, and resumes on leave', () => {
      const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      try {
        showToast({ message: 'Added to favorites', variant: 'positive' });
        const el = region.querySelector('.sg-toast');

        region.dispatchEvent(new MouseEvent('mouseenter'));
        clock.tick(6000); // past the 5000ms floor, but paused — should not have started dismissing
        expect(document.body.contains(el)).to.be.true;

        region.dispatchEvent(new MouseEvent('mouseleave'));
        clock.tick(5000);
        el.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'opacity' }));
        expect(document.body.contains(el)).to.be.false;
      } finally {
        clock.restore();
      }
    });
  });
});
