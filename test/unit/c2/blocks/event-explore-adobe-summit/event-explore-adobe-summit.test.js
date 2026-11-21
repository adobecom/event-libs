import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../../event-libs/v1/c2/blocks/event-explore-adobe-summit/event-explore-adobe-summit.js';

describe('event-explore-adobe-summit', () => {
  beforeEach(async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = await readFile({ path: './mocks/default.html' });
  });

  it('wraps rows into a list of items', async () => {
    const el = document.querySelector('.event-explore-adobe-summit');
    await init(el);
    expect(el.querySelector('.event-explore-adobe-summit-list')).to.exist;
    expect(el.querySelectorAll('.event-explore-adobe-summit-item').length).to.be.greaterThan(0);
  });
});
