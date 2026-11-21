import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../../event-libs/v1/c2/blocks/event-session/event-session.js';

describe('event-session', () => {
  beforeEach(async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = await readFile({ path: './mocks/default.html' });
  });

  it('wraps rows into a list of items', async () => {
    const el = document.querySelector('.event-session');
    await init(el);
    expect(el.querySelector('.event-session-list')).to.exist;
    expect(el.querySelectorAll('.event-session-item').length).to.be.greaterThan(0);
  });
});
