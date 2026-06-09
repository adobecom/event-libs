import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init, { createSocialIcon, buildModalContent } from '../../../../event-libs/v1/blocks/profile-cards/profile-cards.js';
import { setMetadata } from '../../../../event-libs/v1/utils/utils.js';

/** Mirrors Milo modal.js FOCUSABLES selector for initial-focus assertions */
const MODAL_FOCUSABLES_SELECTOR = 'a:not(.hide-video, .faas), button:not([disabled], .locale-modal-v2 .paddle), input, textarea, select, details, [tabindex]:not([tabindex="-1"])';

const head = await readFile({ path: './mocks/head.html' });
const body = await readFile({ path: './mocks/default.html' });

async function waitForSocialIcons(el, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (el.querySelector('.card-social-icons a')) return;
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('Profile Cards Module', () => {
  describe('init', () => {
    beforeEach(() => {
      document.body.innerHTML = body;
      document.head.innerHTML = head;
    });

    it('should render speakers in speakers type block', () => {
      const el = document.querySelector('#speakers-cards');
      init(el);

      const speakerCards = el.querySelectorAll('.card-container');

      expect(el).to.not.be.null;
      expect(speakerCards).to.have.lengthOf(3);
    });

    it('should render judges in judges type block', () => {
      const el = document.querySelector('#judges-cards');
      init(el);

      const judgesCards = el.querySelectorAll('.card-container');
      const carousel = el.querySelector('.carousel-plugin');

      expect(el).to.not.be.null;
      expect(carousel).to.not.be.null;
      expect(judgesCards).to.have.lengthOf(5);
    });

    it('should render host in host type block', () => {
      const el = document.querySelector('#hosts-cards');
      init(el);

      const hostCards = el.querySelectorAll('.card-container');

      expect(el).to.not.be.null;
      expect(hostCards).to.have.lengthOf(1);
      expect(el.classList.contains('single')).to.be.true;
    });

    it('should render social icons for metadata-driven speakers', async () => {
      const el = document.querySelector('#speakers-cards');
      init(el);
      await waitForSocialIcons(el);

      const socialAnchors = el.querySelectorAll('.card-social-icons a');
      expect(socialAnchors.length).to.be.greaterThan(0);
    });

    it('show remove block if no related profile types found', () => {
      const el = document.querySelector('#keynotes-cards');
      init(el);

      const noSpeakers = document.querySelector('#keynotes-cards');

      expect(noSpeakers).to.be.null;
    });

    it('should render simple variant with only image, title and name (no bio or social icons)', () => {
      const el = document.querySelector('#simple-cards');
      init(el);

      const cards = el.querySelectorAll('.card-container');

      expect(el).to.not.be.null;
      expect(cards).to.have.lengthOf(3);

      cards.forEach((card) => {
        expect(card.querySelector('.card-image-container')).to.not.be.null;
        expect(card.querySelector('.card-content')).to.not.be.null;
        expect(card.querySelector('.card-title')).to.not.be.null;
        expect(card.querySelector('.card-name')).to.not.be.null;
        expect(card.querySelector('.card-desc')).to.be.null;
        expect(card.querySelector('.card-social-icons')).to.be.null;
      });
    });

    it('should set alt text on profile images from metadata', () => {
      const el = document.querySelector('#speakers-cards');
      init(el);

      const images = el.querySelectorAll('.card-image');
      images.forEach((img) => {
        expect(img.hasAttribute('alt')).to.be.true;
        expect(img.getAttribute('alt')).to.not.be.empty;
        expect(img.hasAttribute('role')).to.be.false;
      });
    });

    it('should mark images without alt text as decorative', () => {
      const el = document.querySelector('#static-no-alt-cards');
      init(el);

      const img = el.querySelector('.card-image');
      expect(img).to.not.be.null;
      expect(img.getAttribute('alt')).to.equal('');
      expect(img.getAttribute('role')).to.equal('presentation');
    });

    it('should make metadata-driven modal cards interactive', () => {
      const el = document.querySelector('#modal-speakers-cards');
      init(el);

      const cards = el.querySelectorAll('.card-container');
      const firstCard = cards[0];
      const keydownEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });

      firstCard.dispatchEvent(keydownEvent);

      expect(cards).to.have.lengthOf(3);
      expect(firstCard.getAttribute('role')).to.equal('button');
      expect(firstCard.getAttribute('tabindex')).to.equal('0');
      expect(firstCard.getAttribute('aria-haspopup')).to.equal('dialog');
      expect(firstCard.getAttribute('aria-label')).to.include('Open profile modal for');
      expect(keydownEvent.defaultPrevented).to.be.true;
    });

    it('renders all speakers when type cell is empty', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div id="all-cards" class="profile-cards">
          <div><div><h2>Everyone</h2></div></div>
          <div><div>type</div><div></div></div>
        </div>
      `;
      document.body.appendChild(container);
      const el = container.querySelector('#all-cards');
      init(el);

      const cards = el.querySelectorAll('.card-container');
      // head mock contains 9 speakers across speaker/judge/host types
      expect(cards).to.have.lengthOf(9);
    });

    it('filters by type when type cell has a value', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div id="filtered-cards" class="profile-cards">
          <div><div><h2>Speakers only</h2></div></div>
          <div><div>type</div><div>speaker</div></div>
        </div>
      `;
      document.body.appendChild(container);
      const el = container.querySelector('#filtered-cards');
      init(el);

      const cards = el.querySelectorAll('.card-container');
      expect(cards.length).to.be.greaterThan(0);
      expect(cards.length).to.be.lessThan(9);
    });

    it('does not throw when a speaker entry has no speakerType and type cell is empty', () => {
      setMetadata('speakers', JSON.stringify([
        { firstName: 'A', lastName: 'One', title: 't', bio: '', socialLinks: [] },
        { firstName: 'B', lastName: 'Two', title: 't', bio: '', socialLinks: [], speakerType: 'Speaker' },
      ]));

      const container = document.createElement('div');
      container.innerHTML = `
        <div id="loose-cards" class="profile-cards">
          <div><div><h2>Anyone</h2></div></div>
          <div><div>type</div><div></div></div>
        </div>
      `;
      document.body.appendChild(container);
      const el = container.querySelector('#loose-cards');

      expect(() => init(el)).to.not.throw();
      expect(el.querySelectorAll('.card-container')).to.have.lengthOf(2);
    });

    it('should make static-authored modal cards interactive', () => {
      const el = document.querySelector('#static-modal-cards');
      init(el);

      const cards = el.querySelectorAll('.card-container');
      const firstCard = cards[0];

      expect(cards).to.have.lengthOf(1);
      expect(firstCard.getAttribute('role')).to.equal('button');
      expect(firstCard.getAttribute('tabindex')).to.equal('0');
      expect(firstCard.getAttribute('aria-haspopup')).to.equal('dialog');
      expect(firstCard.getAttribute('aria-label')).to.equal('Open profile modal for Static Speaker');
    });
  });

  describe('createSocialIcon', () => {
    it('should return a social icon element', () => {
      const icon = createSocialIcon(document.createElement('svg'), 'facebook');
      const iconAlt = icon.getAttribute('alt');

      expect(icon).to.not.be.null;
      expect(iconAlt).to.equal('facebook logo');
    });
  });

  describe('buildModalContent', () => {
    it('should strip HTML from job title so Milo modal initial focus is not an anchor in .card-title', async () => {
      const fragment = await buildModalContent({
        firstName: 'Jane',
        lastName: 'Doe',
        title: '<a href="https://example.com/">Company</a> VP',
        bio: '',
        socialLinks: [],
      });

      const host = document.createElement('div');
      host.append(fragment);

      const cardTitle = host.querySelector('.card-title');
      expect(cardTitle.querySelector('a')).to.be.null;
      expect(cardTitle.textContent.replace(/\s+/g, ' ').trim()).to.equal('Company VP');

      const focusables = host.querySelectorAll(MODAL_FOCUSABLES_SELECTOR);
      expect(focusables.length).to.be.at.least(1);
      expect(focusables[0].classList.contains('card-name')).to.be.true;
      expect(focusables[0].tagName.toLowerCase()).to.equal('h2');
    });

    it('should decode HTML entities in plain-text titles without using innerHTML', async () => {
      const fragment = await buildModalContent({
        firstName: 'Jane',
        lastName: 'Doe',
        title: 'Lead, AT&amp;T &amp; Partners',
        bio: '',
        socialLinks: [],
      });

      const host = document.createElement('div');
      host.append(fragment);

      expect(host.querySelector('.card-title').textContent.trim()).to.equal('Lead, AT&T & Partners');
    });
  });
});
