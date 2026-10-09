import { expect } from '@esm-bundle/chai';
import { setViewport } from '@web/test-runner-commands';
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

  describe('responsive clamp (MWPW-210273)', () => {
    const LONG = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about creative workflows.`).join(' ');

    // The outer beforeEach resets <head>, so the stylesheet is attached per test.
    beforeEach(async () => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/event-libs/v1/c2/blocks/event-session-details/description-clamp.css';
      await new Promise((resolve, reject) => {
        link.onload = resolve;
        link.onerror = () => reject(new Error(`Failed to load ${link.href}`));
        document.head.append(link);
      });
    });

    beforeEach(() => {
      document.body.innerHTML = '';
      setMetadata('event-details', LONG);
    });

    afterEach(async () => {
      document.body.innerHTML = '';
      await setViewport({ width: 800, height: 600 });
    });

    const mount = async () => {
      const el = renderDescriptionClamp();
      document.body.append(el);
      await new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); });
      return {
        body: el.querySelector('.session-description-text'),
        toggle: el.querySelector('.session-description-toggle'),
      };
    };

    it('clamps the text and offers the toggle on mobile', async () => {
      await setViewport({ width: 375, height: 800 });
      const { body, toggle } = await mount();
      expect(body.scrollHeight).to.be.greaterThan(body.clientHeight + 1);
      expect(toggle.hidden).to.be.false;
      expect(getComputedStyle(toggle).display).to.not.equal('none');
    });

    it('clamps the text and offers the toggle on tablet', async () => {
      await setViewport({ width: 800, height: 800 });
      const { body, toggle } = await mount();
      expect(body.scrollHeight).to.be.greaterThan(body.clientHeight + 1);
      expect(toggle.hidden).to.be.false;
    });

    it('shows the full text with no toggle on desktop', async () => {
      await setViewport({ width: 1280, height: 800 });
      const { body, toggle } = await mount();
      expect(body.scrollHeight).to.be.at.most(body.clientHeight + 1);
      expect(getComputedStyle(body).overflow).to.equal('visible');
      expect(getComputedStyle(toggle).display).to.equal('none');
    });

    it('drops the toggle when a mobile viewport is resized to desktop', async () => {
      await setViewport({ width: 375, height: 800 });
      const { body, toggle } = await mount();
      expect(toggle.hidden).to.be.false;
      await setViewport({ width: 1280, height: 800 });
      await new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); });
      expect(getComputedStyle(toggle).display).to.equal('none');
      expect(body.scrollHeight).to.be.at.most(body.clientHeight + 1);
    });
  });
});
