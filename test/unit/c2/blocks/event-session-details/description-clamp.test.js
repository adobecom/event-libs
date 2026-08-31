import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import { renderDescriptionClamp } from '../../../../../event-libs/v1/c2/blocks/event-session-details/description-clamp.js';

describe('Description "More" Clamp', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('renders the description text', () => {
    setMetadata('description', 'A session about creative workflows.');
    const el = renderDescriptionClamp();
    expect(el.classList.contains('session-description')).to.be.true;
    expect(el.querySelector('.session-description-text').textContent)
      .to.equal('A session about creative workflows.');
  });

  it('returns null when the description is empty', () => {
    setMetadata('description', '   ');
    expect(renderDescriptionClamp()).to.be.null;
  });

  it('starts collapsed and the toggle flips expanded state + label', () => {
    setMetadata('description', 'Long description text.');
    const el = renderDescriptionClamp();
    const toggle = el.querySelector('.session-description-toggle');
    expect(toggle.getAttribute('aria-expanded')).to.equal('false');
    expect(toggle.textContent).to.equal('Show more');
    expect(toggle.getAttribute('daa-ll')).to.equal('Show-More-Description');

    toggle.click();
    expect(el.classList.contains('is-expanded')).to.be.true;
    expect(toggle.getAttribute('aria-expanded')).to.equal('true');
    expect(toggle.textContent).to.equal('Show less');
    expect(toggle.getAttribute('daa-ll')).to.equal('Show-Less-Description');

    toggle.click();
    expect(el.classList.contains('is-expanded')).to.be.false;
    expect(toggle.textContent).to.equal('Show more');
    expect(toggle.getAttribute('daa-ll')).to.equal('Show-More-Description');
  });
});
