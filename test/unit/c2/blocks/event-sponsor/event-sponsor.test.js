import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../../event-libs/v1/c2/blocks/event-sponsor/event-sponsor.js';

describe('event-sponsor', () => {
  beforeEach(async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = await readFile({ path: './mocks/default.html' });
  });

  it('wraps rows into a list of items', async () => {
    const el = document.querySelector('.event-sponsor');
    await init(el);
    expect(el.querySelector('.event-sponsor-list')).to.exist;
    expect(el.querySelectorAll('.event-sponsor-item').length).to.be.greaterThan(0);
  });
});
