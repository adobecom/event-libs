import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import { renderDescriptionClamp } from '../../../../../event-libs/v1/c2/blocks/event-session-details/description-clamp.js';

describe('Description "More" Clamp', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('renders the description text', () => {
    setMetadata('event-details', 'A session about creative workflows.');
    const el = renderDescriptionClamp();
    expect(el.classList.contains('session-description')).to.be.true;
    expect(el.querySelector('.session-description-text').textContent)
      .to.equal('A session about creative workflows.');
  });

  it('returns null when the description is empty', () => {
    setMetadata('event-details', '   ');
    expect(renderDescriptionClamp()).to.be.null;
  });

  it('keeps plain-text line breaks and renders them via pre-line', () => {
    setMetadata('event-details', 'Intro line.\n\nKey takeaways:\\n- One\r\n- Two');
    const body = renderDescriptionClamp().querySelector('.session-description-text');
    expect(body.classList.contains('is-plain-text')).to.be.true;
    expect(body.textContent).to.equal('Intro line.\n\nKey takeaways:\n- One\n- Two');
  });

  it('renders plain text literally rather than parsing it as HTML', () => {
    setMetadata('event-details', 'Use a < b & c > d');
    const body = renderDescriptionClamp().querySelector('.session-description-text');
    expect(body.textContent).to.equal('Use a < b & c > d');
    expect(body.children.length).to.equal(0);
  });

  it('renders authored HTML as markup without the plain-text modifier', () => {
    setMetadata('event-details', 'Intro<br>Line two with <strong>bold</strong>');
    const body = renderDescriptionClamp().querySelector('.session-description-text');
    expect(body.classList.contains('is-plain-text')).to.be.false;
    expect(body.querySelector('br')).to.exist;
    expect(body.querySelector('strong').textContent).to.equal('bold');
  });

  it('starts collapsed and the toggle flips expanded state + label', () => {
    setMetadata('event-details', 'Long description text.');
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
