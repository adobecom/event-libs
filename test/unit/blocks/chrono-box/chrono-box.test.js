import { expect } from '@esm-bundle/chai';

describe('Chrono Box', () => {
  describe('exports', () => {
    it('exports init and fragment outbound helpers', async () => {
      const mod = await import('../../../../event-libs/v1/blocks/chrono-box/chrono-box.js');
      expect(mod.default).to.be.a('function');
      expect(mod.registerChronoBoxOutboundCleanup).to.be.a('function');
      expect(mod.cleanupChronoBoxOutboundNodes).to.be.a('function');
      expect(mod.ensureChronoBoxReparentObserver).to.be.a('function');
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
  });
});
