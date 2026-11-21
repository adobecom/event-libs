import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../../event-libs/v1/c2/blocks/event-experience-everything-ad/event-experience-everything-ad.js';

describe('event-experience-everything-ad', () => {
  beforeEach(async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = await readFile({ path: './mocks/default.html' });
  });

  it('wraps rows into a list of items', async () => {
    const el = document.querySelector('.event-experience-everything-ad');
    await init(el);
    expect(el.querySelector('.event-experience-everything-ad-list')).to.exist;
    expect(el.querySelectorAll('.event-experience-everything-ad-item').length).to.be.greaterThan(0);
  });
});
