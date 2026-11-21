import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../../event-libs/v1/c2/blocks/event-accordion/event-accordion.js';

describe('event-accordion', () => {
  beforeEach(async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = await readFile({ path: './mocks/default.html' });
  });

  it('wraps rows into a list of items', async () => {
    const el = document.querySelector('.event-accordion');
    await init(el);
    expect(el.querySelector('.event-accordion-list')).to.exist;
    expect(el.querySelectorAll('.event-accordion-item').length).to.be.greaterThan(0);
  });
});
