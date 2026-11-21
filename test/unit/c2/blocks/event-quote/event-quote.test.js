import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../../event-libs/v1/c2/blocks/event-quote/event-quote.js';

describe('event-quote', () => {
  beforeEach(async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = await readFile({ path: './mocks/default.html' });
  });

  it('wraps rows into a list of items', async () => {
    const el = document.querySelector('.event-quote');
    await init(el);
    expect(el.querySelector('.event-quote-list')).to.exist;
    expect(el.querySelectorAll('.event-quote-item').length).to.be.greaterThan(0);
  });
});
