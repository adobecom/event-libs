import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import { setFederalRootOverride } from '../../../../../event-libs/v1/features/icons/federal-icons.js';
import init from '../../../../../event-libs/v1/c2/blocks/featured-products/featured-products.js';

// Shared configurator config for all tests — the tier-1-event-config module caches on
// first load, so keep it constant and vary only the Product attribute per test.
const CONFIG = {
  products: {
    Photoshop: { icon: 'photoshop', pageUrl: 'https://www.adobe.com/products/photoshop' },
    Illustrator: { icon: 'illustrator' }, // icon, no pageUrl
  },
};

const productAttr = (labels) => JSON.stringify([{
  name: 'Product',
  inputType: 'multi-select',
  enabled: true,
  values: labels.map((l) => ({ label: l, value: l.toLowerCase() })),
}]);

function setProducts(labels) {
  setMetadata('custom-attributes', productAttr(labels));
}

function block() {
  const el = document.createElement('div');
  el.className = 'featured-products';
  return el;
}

describe('Featured Products', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    // Keep federal icon fetches local (unresolved -> null, gracefully) rather than
    // hitting the external federal CDN, which the test harness disallows.
    setFederalRootOverride('/test/unit/features/icons/mocks/federal');
    setMetadata('tier-1-event-config', JSON.stringify(CONFIG));
  });

  it('renders a title with the product count and a tile per product', async () => {
    setProducts(['Photoshop', 'Illustrator', 'Fresco']);
    const el = block();
    await init(el);
    expect(el.querySelector('.featured-products-title').textContent).to.equal('Featured products (3)');
    const names = [...el.querySelectorAll('.featured-product-name')].map((n) => n.textContent);
    expect(names).to.deep.equal(['Photoshop', 'Illustrator', 'Fresco']);
  });

  it('renders a product with a pageUrl as a new-tab link with an arrow', async () => {
    setProducts(['Photoshop']);
    const el = block();
    await init(el);
    const tile = el.querySelector('.featured-product-tile');
    expect(tile.tagName).to.equal('A');
    expect(tile.getAttribute('href')).to.equal('https://www.adobe.com/products/photoshop');
    expect(tile.getAttribute('target')).to.equal('_blank');
    expect(tile.querySelector('.featured-product-arrow')).to.not.be.null;
    expect(tile.querySelector('.featured-product-icon')).to.not.be.null;
  });

  it('renders a product without a pageUrl as a non-link (no arrow)', async () => {
    setProducts(['Illustrator']);
    const el = block();
    await init(el);
    const tile = el.querySelector('.featured-product-tile');
    expect(tile.tagName).to.equal('SPAN');
    expect(tile.querySelector('.featured-product-arrow')).to.be.null;
    expect(tile.querySelector('.featured-product-icon')).to.not.be.null;
  });

  it('renders a product not in the config as name-only', async () => {
    setProducts(['Unknown Product']);
    const el = block();
    await init(el);
    const tile = el.querySelector('.featured-product-tile');
    expect(tile.tagName).to.equal('SPAN');
    expect(tile.querySelector('.featured-product-name').textContent).to.equal('Unknown Product');
    expect(tile.querySelector('.featured-product-arrow')).to.be.null;
  });

  it('shows a working Show more toggle only when over the limit (6)', async () => {
    setProducts(Array.from({ length: 7 }, (_, i) => `Product ${i}`));
    const el = block();
    await init(el);
    const toggle = el.querySelector('.featured-products-toggle');
    expect(toggle).to.not.be.null;
    expect(el.querySelectorAll('.featured-product.is-overflow')).to.have.lengthOf(1);
    toggle.click();
    expect(el.classList.contains('is-expanded')).to.be.true;
    expect(toggle.textContent).to.equal('Show less');
  });

  it('renders nothing when there are no products', async () => {
    setProducts([]);
    const el = block();
    await init(el);
    expect(el.children).to.have.lengthOf(0);
  });
});
