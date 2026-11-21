import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../../event-libs/v1/c2/blocks/event-faq/event-faq.js';

describe('event-faq', () => {
  beforeEach(async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = await readFile({ path: './mocks/default.html' });
  });

  it('wraps rows into a list of items', async () => {
    const el = document.querySelector('.event-faq');
    await init(el);
    expect(el.querySelector('.event-faq-list')).to.exist;
    expect(el.querySelectorAll('.event-faq-item').length).to.be.greaterThan(0);
  });
});
