import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../../event-libs/v1/c2/blocks/event-pricing/event-pricing.js';

describe('event-pricing', () => {
  beforeEach(async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = await readFile({ path: './mocks/default.html' });
  });

  it('wraps rows into a list of items', async () => {
    const el = document.querySelector('.event-pricing');
    await init(el);
    expect(el.querySelector('.event-pricing-list')).to.exist;
    expect(el.querySelectorAll('.event-pricing-item').length).to.be.greaterThan(0);
  });
});
