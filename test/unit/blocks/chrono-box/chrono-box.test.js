import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../event-libs/v1/utils/utils.js';

describe('Chrono Box', () => {
  describe('exports', () => {
    it('exports init and fragment outbound helpers', async () => {
      const mod = await import('../../../../event-libs/v1/blocks/chrono-box/chrono-box.js');
      expect(mod.default).to.be.a('function');
      expect(mod.registerChronoBoxOutboundCleanup).to.be.a('function');
      expect(mod.cleanupChronoBoxOutboundNodes).to.be.a('function');
      expect(mod.ensureChronoBoxReparentObserver).to.be.a('function');
      expect(mod.revalidatePageTheme).to.be.a('function');
    });
  });

  describe('revalidatePageTheme', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
      document.head.innerHTML = '';
    });

    it('re-applies a page-wide positional theme rule against the current, live DOM', async () => {
      const { revalidatePageTheme } = await import('../../../../event-libs/v1/blocks/chrono-box/chrono-box.js');

      setMetadata('custom-attributes', JSON.stringify([
        { name: 'theme', values: [{ value: 'dark(blocks:text[first])' }] },
      ]));
      document.body.innerHTML = `
        <main><div>
          <div class="text" id="t1"></div>
        </div></main>
      `;

      revalidatePageTheme();
      expect(document.getElementById('t1').classList.contains('dark')).to.be.true;

      // Simulate a chrono-box fragment that resolves later and lands earlier in the DOM
      // than a block already themed by a previous call.
      const t0 = document.createElement('div');
      t0.className = 'text';
      t0.id = 't0';
      document.querySelector('main > div').prepend(t0);

      revalidatePageTheme();

      expect(document.getElementById('t0').classList.contains('dark')).to.be.true;
      expect(document.getElementById('t1').classList.contains('dark')).to.be.false;
    });
  });

  describe('Outbound fragment cleanup', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
      document.head.innerHTML = '';
    });

    it('runs registerChronoBoxOutboundCleanup teardowns once per cleanup call', async () => {
      const {
        registerChronoBoxOutboundCleanup,
        cleanupChronoBoxOutboundNodes,
      } = await import('../../../../event-libs/v1/blocks/chrono-box/chrono-box.js');

      const el = document.createElement('div');
      el.dataset.chronoBoxInstance = 'instance-a';
      let calls = 0;
      registerChronoBoxOutboundCleanup(el, () => { calls += 1; });
      cleanupChronoBoxOutboundNodes(el);
      expect(calls).to.equal(1);
      cleanupChronoBoxOutboundNodes(el);
      expect(calls).to.equal(1);
    });

    it('removes nodes tagged with data-chrono-box-teleport for this instance', async () => {
      const { cleanupChronoBoxOutboundNodes } = await import('../../../../event-libs/v1/blocks/chrono-box/chrono-box.js');

      const host = document.createElement('div');
      host.dataset.chronoBoxInstance = 'teleport-target-id';
      document.body.append(host);

      const stray = document.createElement('aside');
      stray.setAttribute('data-chrono-box-teleport', 'teleport-target-id');
      document.body.append(stray);

      cleanupChronoBoxOutboundNodes(host);
      expect(document.body.contains(stray)).to.equal(false);
    });

    it('dispatches bubbling chrono-box:before-swap with instanceId', async () => {
      const { cleanupChronoBoxOutboundNodes } = await import('../../../../event-libs/v1/blocks/chrono-box/chrono-box.js');

      const host = document.createElement('div');
      host.dataset.chronoBoxInstance = 'swap-test-id';
      document.body.append(host);

      let seen = null;
      const onSwap = (e) => {
        seen = e.detail;
      };
      document.addEventListener('chrono-box:before-swap', onSwap);

      cleanupChronoBoxOutboundNodes(host);
      document.removeEventListener('chrono-box:before-swap', onSwap);

      expect(seen).to.include({ instanceId: 'swap-test-id' });
      expect(seen.root).to.equal(host);
    });

    it('removes elements reparented out of chrono-box (Milo-style hoist)', async () => {
      const {
        cleanupChronoBoxOutboundNodes,
        ensureChronoBoxReparentObserver,
      } = await import('../../../../event-libs/v1/blocks/chrono-box/chrono-box.js');

      const host = document.createElement('div');
      host.dataset.chronoBoxInstance = 'reparent-test';
      document.body.append(host);

      const main = document.createElement('main');
      document.body.append(main);

      const section = document.createElement('section');
      host.append(section);
      expect(host.contains(section)).to.equal(true);

      ensureChronoBoxReparentObserver(host);
      main.append(section);

      expect(host.contains(section)).to.equal(false);
      expect(main.contains(section)).to.equal(true);

      cleanupChronoBoxOutboundNodes(host);
      expect(main.contains(section)).to.equal(false);
    });

    it('does not remove nodes that were only moved within chrono-box (reorder)', async () => {
      const {
        cleanupChronoBoxOutboundNodes,
        ensureChronoBoxReparentObserver,
      } = await import('../../../../event-libs/v1/blocks/chrono-box/chrono-box.js');

      const host = document.createElement('div');
      host.dataset.chronoBoxInstance = 'reorder-test';
      document.body.append(host);

      const inner = document.createElement('div');
      const section = document.createElement('section');
      host.append(inner);
      inner.append(section);
      expect(inner.contains(section)).to.equal(true);

      ensureChronoBoxReparentObserver(host);
      host.append(section);

      expect(host.contains(section)).to.equal(true);
      expect(inner.contains(section)).to.equal(false);

      cleanupChronoBoxOutboundNodes(host);
      expect(host.contains(section)).to.equal(true);
    });
  });

  [
    ['v1', '../../../../event-libs/v1/blocks/chrono-box/chrono-box.js'],
    ['c2', '../../../../event-libs/v1/c2/blocks/chrono-box/chrono-box.js'],
  ].forEach(([label, modulePath]) => {
    describe(`openModalFromPageHashAfterFragment (${label})`, () => {
      let dispatched;
      let originalRaf;
      const onModalOpen = (e) => dispatched.push(e.detail.hash);
      const { pathname, search } = window.location;

      beforeEach(() => {
        // Headless/background tabs may throttle rAF indefinitely; use a timer instead.
        originalRaf = window.requestAnimationFrame;
        window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
        dispatched = [];
        document.body.innerHTML = '';
        document.head.innerHTML = '';
        window.addEventListener('modal:open', onModalOpen);
      });

      afterEach(() => {
        window.requestAnimationFrame = originalRaf;
        window.removeEventListener('modal:open', onModalOpen);
        window.history.replaceState(null, '', `${pathname}${search}`);
      });

      it('does not dispatch modal:open when Milo already decorated the link as a modal', async () => {
        const { openModalFromPageHashAfterFragment } = await import(modulePath);
        const hash = `#rsvp-form-${label}-milo`;
        window.history.replaceState(null, '', hash);
        document.body.innerHTML = `<a class="modal link-block" data-modal-hash="${hash}" href="${hash}">RSVP</a>`;

        await openModalFromPageHashAfterFragment();
        expect(dispatched).to.deep.equal([]);
      });

      it('dispatches modal:open when the matching link is not a Milo modal link', async () => {
        const { openModalFromPageHashAfterFragment } = await import(modulePath);
        const hash = `#rsvp-form-${label}-plain`;
        window.history.replaceState(null, '', hash);
        document.body.innerHTML = `<a data-modal-hash="${hash}" href="${hash}">RSVP</a>`;

        await openModalFromPageHashAfterFragment();
        expect(dispatched).to.deep.equal([hash]);
      });

      it('does not dispatch modal:open when the dialog is already open', async () => {
        const { openModalFromPageHashAfterFragment } = await import(modulePath);
        const hash = `#rsvp-form-${label}-open`;
        window.history.replaceState(null, '', hash);
        document.body.innerHTML = `
          <a data-modal-hash="${hash}" href="${hash}">RSVP</a>
          <div class="dialog-modal" id="${hash.slice(1)}"></div>
        `;

        await openModalFromPageHashAfterFragment();
        expect(dispatched).to.deep.equal([]);
      });

      it('does nothing without a URL hash', async () => {
        const { openModalFromPageHashAfterFragment } = await import(modulePath);
        await openModalFromPageHashAfterFragment();
        expect(dispatched).to.deep.equal([]);
      });
    });
  });
});
