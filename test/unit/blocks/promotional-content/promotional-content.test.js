import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setEventConfig } from '../../../../event-libs/v1/utils/utils.js';
import init, { addMediaReversedClass, getPromotionalContent } from '../../../../event-libs/v1/blocks/promotional-content/promotional-content.js';

// Real EMC shape: matched by `name`, fragment paths are the option `value`s directly.
const PRIMARY_PRODUCT_NAME_ATTR = {
  name: 'primaryProductName',
  attributeId: 'e324ff52-f484-4e61-8c29-a2510861c882',
  inputType: 'single-select',
  label: 'Primary Product Name',
  enabled: true,
  values: [
    { valueId: '819b2874-8e3a-4413-96ce-88b5cf2112b1', label: 'acrobat', value: 'Acrobat', ordinal: 0 },
    { valueId: '142f74ca-2258-4876-8b30-3e23aef996d7', label: 'acrobat-sign', value: 'Acrobat Sign', ordinal: 1 },
  ],
};

const CUSTOM_ATTRS_WITH_PROMO = JSON.stringify([
  PRIMARY_PRODUCT_NAME_ATTR,
  {
    name: 'promotionalItems',
    attributeId: '0d433aa1-0a5a-4836-9146-c6a97bdf08bc',
    inputType: 'multi-select',
    label: 'Promotional Items',
    enabled: true,
    values: [
      {
        valueId: '25506162-447f-471c-8419-e397f1d19022',
        label: 'Adobe Firefly',
        value: '/events/events-shared/fragments/product-blades/firefly',
        ordinal: 0,
      },
      {
        valueId: '4dbc5426-c8e7-4b94-becd-3048b265c61c',
        label: 'Creative Apprenticeship',
        value: '/events/events-shared/fragments/product-blades/creative-apprenticeship.html',
        ordinal: 1,
      },
    ],
  },
]);

const CUSTOM_ATTRS_WITHOUT_PROMO = JSON.stringify([PRIMARY_PRODUCT_NAME_ATTR]);

// Bypasses the /libs/utils/utils.js dynamic import (404s in unit tests) so the legacy
// fetch path can be exercised end-to-end.
const MOCK_PROMO_CONFIG_URL = '/test/mocks/promotional-content.json';

describe('Promotional Content Block', () => {
  let el;
  let fetchStub;

  function addMeta(name, content) {
    const meta = document.createElement('meta');
    meta.name = name;
    meta.content = content;
    document.head.appendChild(meta);
  }

  beforeEach(async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';

    el = document.createElement('div');
    el.className = 'promotional-content';
    document.body.appendChild(el);

    window.LIBS = '/libs';
    setEventConfig({}, { miloLibs: '/libs' });

    fetchStub = sinon.stub(window, 'fetch');
  });

  afterEach(() => {
    sinon.restore();
    delete window.LIBS;
    const metaTags = document.head.querySelectorAll('meta');
    metaTags.forEach((tag) => tag.remove());
  });

  describe('init — new path via custom-attributes', () => {
    it('returns early with no fetch when custom-attributes meta is absent', async () => {
      await init(el);
      expect(fetchStub.called).to.be.false;
    });

    it('returns early with no fetch when custom-attributes has no promotionalItems entry', async () => {
      addMeta('custom-attributes', CUSTOM_ATTRS_WITHOUT_PROMO);
      await init(el);
      expect(fetchStub.called).to.be.false;
    });

    it('does not fetch promotional-content.json when custom-attributes provides fragment paths', async () => {
      addMeta('custom-attributes', CUSTOM_ATTRS_WITH_PROMO);
      fetchStub.resolves({ ok: true, text: () => Promise.resolve('<div></div>') });

      try {
        await init(el);
      } catch (e) {
        // loadFragment dynamic import is not available in unit test env
      }

      const configFetched = fetchStub.args.some(([url]) => String(url).includes('promotional-content.json'));
      expect(configFetched).to.be.false;
    });

    it('resolves relative fragment paths against the current domain', async () => {
      addMeta('custom-attributes', CUSTOM_ATTRS_WITH_PROMO);

      const fragmentUrls = await getPromotionalContent();

      expect(fragmentUrls).to.deep.equal([
        `${window.location.origin}/events/events-shared/fragments/product-blades/firefly`,
        `${window.location.origin}/events/events-shared/fragments/product-blades/creative-apprenticeship.html`,
      ]);
    });

    it('leaves absolute https fragment URLs untouched', async () => {
      const customAttrsWithAbsoluteUrl = JSON.stringify([
        {
          name: 'promotionalItems',
          attributeId: '0d433aa1-0a5a-4836-9146-c6a97bdf08bc',
          values: [
            { valueId: '1', value: 'https://example.com/fragments/product-blades/firefly' },
          ],
        },
      ]);
      addMeta('custom-attributes', customAttrsWithAbsoluteUrl);

      const fragmentUrls = await getPromotionalContent();

      expect(fragmentUrls).to.deep.equal(['https://example.com/fragments/product-blades/firefly']);
    });

    it('prepends the locale prefix to relative fragment paths', async () => {
      setEventConfig({}, { miloLibs: '/test/unit/blocks/promotional-content/mocks/libs' });
      addMeta('custom-attributes', CUSTOM_ATTRS_WITH_PROMO);

      const fragmentUrls = await getPromotionalContent();

      expect(fragmentUrls).to.deep.equal([
        `${window.location.origin}/uk/events/events-shared/fragments/product-blades/firefly`,
        `${window.location.origin}/uk/events/events-shared/fragments/product-blades/creative-apprenticeship.html`,
      ]);
    });
  });

  describe('init — legacy path via promotional-items', () => {
    it('returns early with no fetch when promotional-items meta is absent', async () => {
      await init(el);
      expect(fetchStub.called).to.be.false;
    });

    it('returns early with no fetch on invalid promotional-items JSON', async () => {
      addMeta('promotional-items', 'invalid json');
      await init(el);
      expect(fetchStub.called).to.be.false;
    });

    it('fetches promotional-content.json when valid promotional-items are present', async () => {
      addMeta('promotional-items', '["Acrobat"]');
      addMeta('promotional-content-location', MOCK_PROMO_CONFIG_URL);
      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve({ data: [{ name: 'Acrobat', 'fragment-path': '/fragments/acrobat' }] }),
      });

      try {
        await init(el);
      } catch (e) {
        // loadFragment dynamic import is not available in unit test env
      }

      const configFetched = fetchStub.args.some(([url]) => String(url).includes('promotional-content.json'));
      expect(configFetched).to.be.true;
    });

    it('returns early when promotional-content.json has no data', async () => {
      addMeta('promotional-items', '["Acrobat"]');
      addMeta('promotional-content-location', MOCK_PROMO_CONFIG_URL);
      fetchStub.resolves({ ok: true, json: () => Promise.resolve({ data: [] }) });

      await init(el);
      expect(el.children.length).to.equal(0);
    });
  });

  describe('addMediaReversedClass', () => {
    it('removes media-reverse-mobile from all media blocks', () => {
      for (let i = 0; i < 2; i++) {
        const div = document.createElement('div');
        div.className = 'media media-reverse-mobile';
        el.appendChild(div);
      }

      addMediaReversedClass(el);

      el.querySelectorAll('.media').forEach((block) => {
        expect(block.classList.contains('media-reverse-mobile')).to.be.false;
      });
    });

    it('adds media-reversed to odd-indexed media blocks only', () => {
      for (let i = 0; i < 3; i++) {
        const div = document.createElement('div');
        div.className = 'media';
        el.appendChild(div);
      }

      addMediaReversedClass(el);

      const blocks = el.querySelectorAll('.media');
      expect(blocks[0].classList.contains('media-reversed')).to.be.false;
      expect(blocks[1].classList.contains('media-reversed')).to.be.true;
      expect(blocks[2].classList.contains('media-reversed')).to.be.false;
    });
  });
});
