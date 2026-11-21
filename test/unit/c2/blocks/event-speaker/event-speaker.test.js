import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../../event-libs/v1/c2/blocks/event-speaker/event-speaker.js';

describe('event-speaker', () => {
  beforeEach(async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = await readFile({ path: './mocks/default.html' });
  });

  it('wraps rows into a list of items', async () => {
    const el = document.querySelector('.event-speaker');
    await init(el);
    expect(el.querySelector('.event-speaker-list')).to.exist;
    expect(el.querySelectorAll('.event-speaker-item').length).to.be.greaterThan(0);
  });
});
