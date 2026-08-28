import { expect } from '@esm-bundle/chai';
import init from '../../../../../event-libs/v1/c2/blocks/session-broadcast/session-broadcast.js';

// Phase 0 scaffolding only — this just proves the block is loadable and registered
// correctly. Real behavior is covered by later phases' component/unit tests.
describe('session-broadcast (scaffolding)', () => {
  it('marks the block element and clears any authored placeholder content', async () => {
    const el = document.createElement('div');
    el.className = 'session-broadcast';
    el.innerHTML = '<p>placeholder</p>';
    await init(el);
    expect(el.classList.contains('session-broadcast')).to.be.true;
    expect(el.innerHTML).to.equal('');
  });
});
