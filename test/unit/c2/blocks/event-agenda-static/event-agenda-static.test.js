import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../../event-libs/v1/c2/blocks/event-agenda-static/event-agenda-static.js';

describe('event-agenda-static', () => {
  beforeEach(async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = await readFile({ path: './mocks/default.html' });
  });

  it('wraps rows into a list of items', async () => {
    const el = document.querySelector('.event-agenda-static');
    await init(el);
    expect(el.querySelector('.event-agenda-static-list')).to.exist;
    expect(el.querySelectorAll('.event-agenda-static-item').length).to.be.greaterThan(0);
  });
});
