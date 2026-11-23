// Gate test for the authored Milo block forge-max-rounded-top-wrapper.
// Runs under Milo's @web/test-runner (browser). The fixture (mocks/body.html)
// mirrors the REAL class-less DA serialization, so these assertions gate that
// init() RECONSTRUCTS the agenda layout — not merely that it runs.
import { readFile } from '@web/test-runner-commands';
import { expect } from '@esm-bundle/chai';
import init from './forge-max-rounded-top-wrapper.js';

describe('forge-max-rounded-top-wrapper', () => {
  it('exports a callable init(el)', () => {
    expect(init).to.be.a('function');
  });

  it('reconstructs the agenda tracks from flat DA content', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/body.html' });
    const block = document.querySelector('.forge-max-rounded-top-wrapper');
    expect(block, 'mock body has the block root').to.exist;
    await init(block);

    // Marker + two tracks (in-person default-visible, online hidden).
    expect(block.dataset.forgeAuthored).to.equal('forge-max-rounded-top-wrapper');
    const panels = block.querySelectorAll('.frmaw-panel');
    expect(panels.length, 'in-person + online panels').to.equal(2);
    expect(panels[1].hidden, 'second track hidden by default').to.equal(true);

    // Desktop grid rebuilt (empty <li> spacers dropped → 2 real cards in-person).
    expect(panels[0].querySelectorAll('.frmaw-grid .frmaw-card').length).to.equal(2);
    // Mobile accordion rebuilt alongside it.
    expect(panels[0].querySelector('.frmaw-accordion .frmaw-acc-item')).to.exist;
    // Toggles are real <button>s, not <a href="#"> styled as buttons.
    const toggles = [...block.querySelectorAll('.frmaw-toggle')];
    expect(toggles.length === 2 && toggles.every((b) => b.tagName === 'BUTTON')).to.equal(true);
  });
});
