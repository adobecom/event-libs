import { expect } from '@esm-bundle/chai';
import { executeServerCommand, readFile, setViewport } from '@web/test-runner-commands';
import init, {
  createSocialIcon, buildModalContent, syncBladeBiosOverflow, syncBiosOverflow,
} from '../../../../event-libs/v1/blocks/profile-cards/profile-cards.js';
import { setMetadata } from '../../../../event-libs/v1/utils/utils.js';

/** Mirrors Milo modal.js FOCUSABLES selector for initial-focus assertions */
const MODAL_FOCUSABLES_SELECTOR = 'a:not(.hide-video, .faas), button:not([disabled], .locale-modal-v2 .paddle), input, textarea, select, details, [tabindex]:not([tabindex="-1"])';

const head = await readFile({ path: './mocks/head.html' });
const body = await readFile({ path: './mocks/default.html' });
const profileCss = await readFile({ path: '../../../../event-libs/v1/blocks/profile-cards/profile-cards.css' });
const miloCss = await readFile({ path: '../../../../node_modules/@adobecom/milo/libs/styles/styles.css' });

async function waitForSocialIcons(el, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (el.querySelector('.card-social-icons a')) return;
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Polls rather than waiting a fixed number of rAFs/ms, which get throttled unpredictably when many test files run concurrently. */
async function waitFor(conditionFn, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (conditionFn()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('waitFor: condition not met within timeout');
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

    it('renders a first-name-only speaker without a trailing space or "undefined"', () => {
      setMetadata('speakers', JSON.stringify([
        { firstName: 'Cher', lastName: '', title: 'Performer', bio: '', socialLinks: [], speakerType: 'Speaker' },
        { firstName: 'Bono', title: 'Musician', bio: '', socialLinks: [], speakerType: 'Speaker' },
      ]));

      const container = document.createElement('div');
      container.innerHTML = `
        <div id="single-name-cards" class="profile-cards">
          <div><div><h2>Speakers</h2></div></div>
          <div><div>type</div><div>speaker</div></div>
        </div>
      `;
      document.body.appendChild(container);
      const el = container.querySelector('#single-name-cards');

      expect(() => init(el)).to.not.throw();
      const names = [...el.querySelectorAll('.card-name')].map((n) => n.textContent);
      expect(names).to.include('Cher');
      expect(names).to.include('Bono');
      names.forEach((name) => expect(name).to.not.include('undefined'));
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

  describe('sorting', () => {
    const speakers = [
      { firstName: 'Charlie', lastName: 'Zebra', speakerType: 'Speaker', ordinal: 2 },
      { firstName: 'Alice', lastName: 'Mango', speakerType: 'Speaker', ordinal: 0 },
      { firstName: 'Bob', lastName: 'Apple', speakerType: 'Speaker', ordinal: 1 },
    ];

    function makeBlock(classes, configRows) {
      const el = document.createElement('div');
      el.className = `profile-cards ${classes}`;
      el.innerHTML = `<div><div><h2>Heading</h2></div></div>${configRows}`;
      document.body.appendChild(el);
      return el;
    }

    function getCardNames(el) {
      return Array.from(el.querySelectorAll('.card-name')).map((n) => n.textContent.trim());
    }

    beforeEach(() => {
      setMetadata('speakers', JSON.stringify(speakers));
    });

    it('falls back to ordinal order when no order row is present', () => {
      const el = makeBlock('', '<div><div>type</div><div>speaker</div></div>');
      init(el);
      expect(getCardNames(el)).to.deep.equal(['Alice Mango', 'Bob Apple', 'Charlie Zebra']);
    });

    it('sorts by lastName ascending when order row is present and class is asc', () => {
      const el = makeBlock('asc', `
        <div><div>type</div><div>speaker</div></div>
        <div><div>order</div><div>lastName</div></div>
      `);
      init(el);
      expect(getCardNames(el)).to.deep.equal(['Bob Apple', 'Alice Mango', 'Charlie Zebra']);
    });

    it('sorts by lastName descending when class is desc', () => {
      const el = makeBlock('desc', `
        <div><div>type</div><div>speaker</div></div>
        <div><div>order</div><div>lastName</div></div>
      `);
      init(el);
      expect(getCardNames(el)).to.deep.equal(['Charlie Zebra', 'Alice Mango', 'Bob Apple']);
    });

    it('sorts by firstName ascending', () => {
      const el = makeBlock('asc', `
        <div><div>type</div><div>speaker</div></div>
        <div><div>order</div><div>firstName</div></div>
      `);
      init(el);
      expect(getCardNames(el)).to.deep.equal(['Alice Mango', 'Bob Apple', 'Charlie Zebra']);
    });

    it('applies explicit sort when order row comes before type row', () => {
      const el = makeBlock('asc', `
        <div><div>order</div><div>lastName</div></div>
        <div><div>type</div><div>speaker</div></div>
      `);
      init(el);
      expect(getCardNames(el)).to.deep.equal(['Bob Apple', 'Alice Mango', 'Charlie Zebra']);
    });

    it('falls back to ordinal order when order row has no field value', () => {
      const el = makeBlock('asc', `
        <div><div>type</div><div>speaker</div></div>
        <div><div>order</div><div></div></div>
      `);
      init(el);
      expect(getCardNames(el)).to.deep.equal(['Alice Mango', 'Bob Apple', 'Charlie Zebra']);
    });

    it('treats missing asc/desc class as ascending', () => {
      const el = makeBlock('', `
        <div><div>type</div><div>speaker</div></div>
        <div><div>order</div><div>lastName</div></div>
      `);
      init(el);
      expect(getCardNames(el)).to.deep.equal(['Bob Apple', 'Alice Mango', 'Charlie Zebra']);
    });

    it('treats unknown order field as stable sort (all values empty, original order preserved)', () => {
      const el = makeBlock('asc', `
        <div><div>type</div><div>speaker</div></div>
        <div><div>order</div><div>nonExistentField</div></div>
      `);
      init(el);
      expect(getCardNames(el)).to.have.lengthOf(3);
    });

    it('removes the block when type filter matches zero speakers', () => {
      const el = makeBlock('', '<div><div>type</div><div>panelist</div></div>');
      document.body.appendChild(el);
      init(el);
      expect(document.body.contains(el)).to.be.false;
    });

    it('removes the order config row from the DOM', () => {
      const el = makeBlock('asc', `
        <div><div>type</div><div>speaker</div></div>
        <div><div>order</div><div>lastName</div></div>
      `);
      init(el);
      const configRows = Array.from(el.querySelectorAll(':scope > div:not(.cards-wrapper)')).slice(1);
      expect(configRows).to.have.lengthOf(0);
    });
  });

  describe('image-height bio truncation', () => {
    const longBio = `<p>${'A speaker biography with enough detail to overflow the card. '.repeat(60)}</p>`;
    const originalViewport = { width: window.innerWidth, height: window.innerHeight };

    function makeBlock(bios, classes = '') {
      setMetadata('speakers', JSON.stringify(bios.map((bio, index) => ({
        firstName: 'Speaker',
        lastName: String(index),
        title: 'Graphic Design & Executive Creative Director at Sunday After',
        bio,
        photo: { imageUrl: '/event-libs/v1/icons/preview-eye.svg' },
        socialLinks: [{ link: 'https://www.instagram.com/speaker', serviceName: 'Instagram' }],
      }))));
      const el = document.createElement('div');
      el.className = `profile-cards ${classes}`;
      el.innerHTML = '<div><div><h2>Speakers</h2></div></div><div><div>type</div><div></div></div>';
      document.body.append(el);
      init(el);
      return el;
    }

    beforeEach(() => {
      document.body.innerHTML = '';
      document.head.innerHTML = '';
      const style = document.createElement('style');
      style.textContent = `${miloCss}\n${profileCss}
        .profile-cards .card-desc { margin-bottom: 0; }
        :root {
          --body-font-family: Arial, sans-serif;
          --type-body-xs-size: 14px;
          --type-body-xs-lh: 20px;
          --type-body-l-size: 18px;
          --type-body-l-lh: 24px;
          --type-heading-l-size: 28px;
        }`;
      document.head.append(style);
    });

    afterEach(async () => {
      await setViewport(originalViewport);
    });

    [375, 499, 600, 768, 899, 900, 1200].forEach((width) => {
      it(`fits collapsed text and controls within the image height at ${width}px and toggles the full rich bio`, async () => {
        await setViewport({ width, height: 900 });
        const el = makeBlock([longBio]);
        await waitForSocialIcons(el);
        syncBiosOverflow(el);

        const card = el.querySelector('.card-container');
        const content = card.querySelector('.card-content');
        const image = card.querySelector('.card-image-container');
        const desc = card.querySelector('.card-desc');
        const btn = card.querySelector('.bio-read-more');
        const collapsedHeight = content.getBoundingClientRect().height;

        expect(btn.hidden).to.be.false;
        expect(btn.textContent).to.equal('');
        expect(btn.querySelector('svg').getAttribute('aria-hidden')).to.equal('true');
        expect(btn.getAttribute('aria-label')).to.include('Expand Speaker');
        expect(btn.getAttribute('aria-expanded')).to.equal('false');
        expect(btn.getAttribute('aria-controls')).to.equal(desc.id);
        expect(desc.querySelector('p')).to.not.be.null;
        expect(desc.scrollHeight).to.be.greaterThan(desc.clientHeight);
        expect(desc.clientHeight).to.be.greaterThan(0);
        const lineHeight = parseFloat(getComputedStyle(desc).lineHeight);
        expect(desc.getBoundingClientRect().height % lineHeight).to.be.closeTo(0, 0.1);
        expect(getComputedStyle(desc).webkitLineClamp).to.equal(String(desc.clientHeight / lineHeight));
        expect(btn.getBoundingClientRect().bottom).to.be.closeTo(desc.getBoundingClientRect().bottom, 1);
        expect(btn.getBoundingClientRect().top)
          .to.be.at.least(desc.getBoundingClientRect().bottom - lineHeight);
        expect(collapsedHeight).to.be.closeTo(image.getBoundingClientRect().height, 1);
        expect(btn.getBoundingClientRect().bottom).to.be.at.most(content.getBoundingClientRect().bottom);
        expect(card.querySelector('.card-social-icons').getBoundingClientRect().bottom)
          .to.be.at.most(content.getBoundingClientRect().bottom);
        expect(card.querySelector('.card-social-icons').getBoundingClientRect().top)
          .to.be.at.least(desc.getBoundingClientRect().bottom);
        expect(desc.getBoundingClientRect().top)
          .to.be.at.least(card.querySelector('.card-name').getBoundingClientRect().bottom);

        btn.click();
        syncBiosOverflow(el);
        expect(btn.hidden).to.be.false;
        expect(btn.getAttribute('aria-expanded')).to.equal('true');
        expect(btn.getAttribute('aria-label')).to.include('Collapse Speaker');
        expect(btn.querySelector('svg')).to.not.be.null;
        expect(content.getBoundingClientRect().height).to.be.greaterThan(collapsedHeight);
        expect(desc.innerHTML).to.equal(longBio);
        expect(desc.scrollHeight).to.equal(desc.clientHeight);

        btn.click();
        expect(btn.getAttribute('aria-expanded')).to.equal('false');
        expect(content.getBoundingClientRect().height).to.be.closeTo(collapsedHeight, 1);
      });
    });

    it('keeps the bio and inline control visible when resizing a single card between desktop and tablet', async function responsiveBio() {
      this.timeout(10000);
      await executeServerCommand('focus-test-page');
      await setViewport({ width: 1200, height: 900 });
      const el = makeBlock([longBio]);
      await waitForSocialIcons(el);
      const card = el.querySelector('.card-container');
      const desc = card.querySelector('.card-desc');
      const button = card.querySelector('.bio-read-more');
      const image = card.querySelector('.card-image-container');
      const content = card.querySelector('.card-content');

      for (const width of [768, 499, 900, 1200]) {
        await setViewport({ width, height: 900 });
        await waitFor(() => {
          const lineHeight = parseFloat(getComputedStyle(desc).lineHeight);
          return content.getBoundingClientRect().height === image.getBoundingClientRect().height
            && desc.clientHeight >= lineHeight
            && Math.abs(button.getBoundingClientRect().bottom
              - desc.getBoundingClientRect().bottom) < 1;
        });
        expect(button.hidden).to.be.false;
        button.click();
        expect(desc.scrollHeight).to.equal(desc.clientHeight);
        button.click();
        expect(desc.clientHeight).to.be.greaterThan(0);
      }
    });

    it('keeps collapsed row heights equal and hides controls for short or missing bios', async () => {
      await setViewport({ width: 1200, height: 900 });
      const el = makeBlock([longBio, 'Short bio.', '']);
      await waitForSocialIcons(el);
      syncBiosOverflow(el);

      const cards = [...el.querySelectorAll('.card-container')];
      expect(cards[0].querySelector('.bio-read-more').hidden).to.be.false;
      expect(cards[1].querySelector('.bio-read-more').hidden).to.be.true;
      expect(cards[2].querySelector('.bio-read-more')).to.be.null;
      cards.forEach((card) => {
        expect(card.getBoundingClientRect().height)
          .to.be.closeTo(cards[0].getBoundingClientRect().height, 1);
      });
    });

    it('updates the collapsed height when the image resizes', () => {
      const el = makeBlock([longBio]);
      const card = el.querySelector('.card-container');
      const image = card.querySelector('.card-image-container');
      image.style.height = '320px';
      syncBiosOverflow(el);
      expect(card.style.getPropertyValue('--profile-image-height')).to.equal('320px');
      expect(card.querySelector('.card-content').getBoundingClientRect().height).to.be.closeTo(320, 1);
    });

    it('collapses static-authored rich bios but leaves modal cards and profiles without images intact', () => {
      const el = document.createElement('div');
      el.className = 'profile-cards';
      el.innerHTML = `<div><div><h2>Speakers</h2></div></div>
        <div><div><img src="/event-libs/v1/icons/preview-eye.svg"><p>Designer</p><h3>Static Speaker</h3>${longBio}</div></div>`;
      document.body.append(el);
      init(el);
      expect(el.querySelector('.bio-read-more').hidden).to.be.false;
      expect(el.querySelector('.card-desc').scrollHeight)
        .to.be.greaterThan(el.querySelector('.card-desc').clientHeight);

      const modal = makeBlock([longBio], 'modal');
      expect(modal.querySelector('.bio-read-more')).to.be.null;
      expect(modal.querySelector('.modal-trigger')).to.not.be.null;
      const noImage = document.createElement('div');
      noImage.className = 'profile-cards';
      noImage.innerHTML = `<div><div><h2>Speakers</h2></div></div>
        <div><div><h3>No Image</h3>${longBio}</div></div>`;
      document.body.append(noImage);
      init(noImage);
      expect(noImage.querySelector('.bio-read-more')).to.be.null;
      expect(noImage.querySelector('.card-desc').innerHTML).to.equal(longBio);
    });
  });

  describe('blade variant', () => {
    const BIO = 'A short bio used across blade variant tests.';

    function makeBladeBlock(speakers, { classes = 'blade', configRows = '<div><div>type</div><div>speaker</div></div>' } = {}) {
      setMetadata('speakers', JSON.stringify(speakers));
      const el = document.createElement('div');
      el.className = `profile-cards ${classes}`;
      el.innerHTML = `<div><div><h2>Heading</h2></div></div>${configRows}`;
      document.body.appendChild(el);
      return el;
    }

    // Mirrors the sessions-hub line-clamp overflow pattern: stub scrollHeight/
    // clientHeight rather than relying on real layout, then sync directly.
    function stubOverflow(desc, isOverflowing) {
      Object.defineProperty(desc, 'scrollHeight', { configurable: true, get: () => (isOverflowing ? 200 : 100) });
      Object.defineProperty(desc, 'clientHeight', { configurable: true, get: () => 100 });
    }

    beforeEach(() => {
      document.body.innerHTML = body;
      document.head.innerHTML = head;
    });

    it('renders name and title but no company field, social icons, or modal trigger', () => {
      const el = document.querySelector('#blade-cards');
      init(el);

      const cards = el.querySelectorAll('.card-container');
      expect(cards).to.have.lengthOf(3);

      cards.forEach((card) => {
        expect(card.querySelector('.card-name')).to.not.be.null;
        expect(card.querySelector('.card-title')).to.not.be.null;
        expect(card.querySelector('.card-company')).to.be.null;
        expect(card.querySelector('.card-social-icons')).to.be.null;
        expect(card.getAttribute('role')).to.not.equal('button');
        expect(card.hasAttribute('aria-haspopup')).to.be.false;
      });
    });

    it('does not add the single class or center a 3-card blade block', () => {
      const el = document.querySelector('#blade-cards');
      init(el);

      expect(el.classList.contains('single')).to.be.false;
    });

    it('does not enable modal even when the modal class is also authored', () => {
      const el = makeBladeBlock([
        { firstName: 'Ada', lastName: 'Lovelace', speakerType: 'Speaker', title: 'Mathematician', bio: BIO },
      ], { classes: 'blade modal' });
      init(el);

      const card = el.querySelector('.card-container');
      expect(card.getAttribute('role')).to.not.equal('button');
      expect(card.hasAttribute('aria-haspopup')).to.be.false;
      expect(card.classList.contains('modal-trigger')).to.be.false;
    });

    it('does not enable the carousel even with more than 3 speakers', () => {
      const el = makeBladeBlock([
        { firstName: 'A', lastName: 'One', speakerType: 'Speaker', title: 't', bio: BIO },
        { firstName: 'B', lastName: 'Two', speakerType: 'Speaker', title: 't', bio: BIO },
        { firstName: 'C', lastName: 'Three', speakerType: 'Speaker', title: 't', bio: BIO },
        { firstName: 'D', lastName: 'Four', speakerType: 'Speaker', title: 't', bio: BIO },
      ]);
      init(el);

      expect(el.querySelectorAll('.card-container')).to.have.lengthOf(4);
      expect(el.classList.contains('with-carousel')).to.be.false;
      expect(el.querySelector('.carousel-plugin')).to.be.null;
    });

    it('does not add the single class for a lone blade speaker', () => {
      const el = makeBladeBlock([
        { firstName: 'Solo', lastName: 'Speaker', speakerType: 'Speaker', title: 't', bio: BIO },
      ]);
      init(el);

      expect(el.querySelectorAll('.card-container')).to.have.lengthOf(1);
      expect(el.classList.contains('single')).to.be.false;
    });

    it('always renders the full bio text (no character-based truncation)', () => {
      const el = makeBladeBlock([
        { firstName: 'Full', lastName: 'Bio', speakerType: 'Speaker', title: 't', bio: BIO },
      ]);
      init(el);

      expect(el.querySelector('.blade-desc').textContent).to.equal(BIO);
    });

    it('keeps the Read more button hidden when the 2-line-clamped bio does not overflow', () => {
      const el = makeBladeBlock([
        { firstName: 'Fits', lastName: 'Bio', speakerType: 'Speaker', title: 't', bio: BIO },
      ]);
      init(el);

      const desc = el.querySelector('.blade-desc');
      stubOverflow(desc, false);
      syncBladeBiosOverflow(el);

      expect(el.querySelector('.blade-read-more').hidden).to.be.true;
    });

    it('reveals the Read more button when the 2-line-clamped bio overflows, and toggles Collapse on click', () => {
      const el = makeBladeBlock([
        { firstName: 'Overflow', lastName: 'Bio', speakerType: 'Speaker', title: 't', bio: BIO },
      ]);
      init(el);

      const card = el.querySelector('.card-container');
      const desc = el.querySelector('.blade-desc');
      stubOverflow(desc, true);
      syncBladeBiosOverflow(el);

      const btn = el.querySelector('.blade-read-more');
      expect(btn.hidden).to.be.false;
      expect(btn.textContent).to.equal('Read more');
      expect(btn.getAttribute('aria-expanded')).to.equal('false');
      expect(card.classList.contains('expanded')).to.be.false;

      btn.click();
      expect(card.classList.contains('expanded')).to.be.true;
      expect(btn.textContent).to.equal('Collapse');
      expect(btn.getAttribute('aria-expanded')).to.equal('true');
      // the bio text itself never changes - CSS line-clamp handles the visual truncation
      expect(desc.textContent).to.equal(BIO);

      btn.click();
      expect(card.classList.contains('expanded')).to.be.false;
      expect(btn.textContent).to.equal('Read more');
      expect(btn.getAttribute('aria-expanded')).to.equal('false');
    });

    it('keeps the Read more button visible once expanded even if a later sync re-runs', () => {
      const el = makeBladeBlock([
        { firstName: 'Overflow', lastName: 'Bio', speakerType: 'Speaker', title: 't', bio: BIO },
      ]);
      init(el);

      const card = el.querySelector('.card-container');
      const desc = el.querySelector('.blade-desc');
      stubOverflow(desc, true);
      syncBladeBiosOverflow(el);
      el.querySelector('.blade-read-more').click();

      // simulate re-running the overflow sync (e.g. from a resize) while expanded
      syncBladeBiosOverflow(el);

      expect(card.classList.contains('expanded')).to.be.true;
      expect(el.querySelector('.blade-read-more').hidden).to.be.false;
    });

    it('renders a static-authored blade card whose Read more toggle expands without changing the bio text', () => {
      const el = document.querySelector('#blade-static-cards');
      init(el);

      const card = el.querySelector('.card-container');
      expect(card.querySelector('.card-name').textContent.trim()).to.equal('Static Blade Speaker');
      expect(card.querySelector('.card-title').textContent.trim()).to.equal('VP of Marketing, Adobe');
      expect(card.querySelector('.card-social-icons')).to.be.null;

      const desc = card.querySelector('.blade-desc');
      const originalText = desc.textContent;
      stubOverflow(desc, true);
      syncBladeBiosOverflow(el);

      const btn = card.querySelector('.blade-read-more');
      expect(btn.hidden).to.be.false;

      btn.click();
      expect(card.classList.contains('expanded')).to.be.true;
      expect(desc.textContent).to.equal(originalText);
    });

    // Real rAF/ResizeObserver can be suspended indefinitely on a backgrounded page when many WTR sessions share a browser, so stub both instead of racing that.
    function stubRaf() {
      const original = window.requestAnimationFrame;
      Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        value: (cb) => setTimeout(cb, 0),
      });
      return () => Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, value: original });
    }

    function stubResizeObserver() {
      const original = window.ResizeObserver;
      const instances = [];
      class FakeResizeObserver {
        constructor(callback) {
          this.callback = callback;
          instances.push(this);
        }

        observe() {}

        disconnect() {}
      }
      Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: FakeResizeObserver });
      return {
        instances,
        restore: () => Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: original }),
      };
    }

    it('waits for document.fonts.ready before performing the initial overflow sync', async function bladeFontsReadyGate() {
      this.timeout(10000);
      const restoreRaf = stubRaf();
      const { restore: restoreRo } = stubResizeObserver();
      const originalFonts = document.fonts;
      let resolveFonts;
      const fontsReady = new Promise((resolve) => { resolveFonts = resolve; });
      Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: fontsReady } });

      try {
        const el = makeBladeBlock([
          { firstName: 'Wait', lastName: 'ForFonts', speakerType: 'Speaker', title: 't', bio: BIO },
        ]);
        init(el);

        const desc = el.querySelector('.blade-desc');
        stubOverflow(desc, true);

        // fontsReady is still unresolved, so the sync can't have run yet.
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(el.querySelector('.blade-read-more').hidden).to.be.true;

        resolveFonts();
        await waitFor(() => el.querySelector('.blade-read-more').hidden === false);
      } finally {
        Object.defineProperty(document, 'fonts', { configurable: true, value: originalFonts });
        restoreRo();
        restoreRaf();
      }
    });

    it('does not throw when document.fonts is unavailable', async function bladeNoFontsApi() {
      this.timeout(10000);
      const restoreRaf = stubRaf();
      const { restore: restoreRo } = stubResizeObserver();
      const originalFonts = document.fonts;
      Object.defineProperty(document, 'fonts', { configurable: true, value: undefined });

      try {
        const el = makeBladeBlock([
          { firstName: 'No', lastName: 'FontsApi', speakerType: 'Speaker', title: 't', bio: BIO },
        ]);
        expect(() => init(el)).to.not.throw();

        const desc = el.querySelector('.blade-desc');
        stubOverflow(desc, true);
        await waitFor(() => el.querySelector('.blade-read-more').hidden === false);
      } finally {
        Object.defineProperty(document, 'fonts', { configurable: true, value: originalFonts });
        restoreRo();
        restoreRaf();
      }
    });

    it('does not throw when ResizeObserver is unavailable', async function bladeNoResizeObserver() {
      this.timeout(10000);
      const restoreRaf = stubRaf();
      const originalResizeObserver = window.ResizeObserver;
      Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: undefined });

      try {
        const el = makeBladeBlock([
          { firstName: 'No', lastName: 'ResizeObserverApi', speakerType: 'Speaker', title: 't', bio: BIO },
        ]);
        expect(() => init(el)).to.not.throw();

        const desc = el.querySelector('.blade-desc');
        stubOverflow(desc, true);
        await waitFor(() => el.querySelector('.blade-read-more').hidden === false);
      } finally {
        Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: originalResizeObserver });
        restoreRaf();
      }
    });

    it('re-syncs via the ResizeObserver backstop when the cards wrapper resizes', async function bladeResizeObserverBackstop() {
      this.timeout(10000);
      const restoreRaf = stubRaf();
      const { instances, restore: restoreRo } = stubResizeObserver();

      try {
        const el = makeBladeBlock([
          { firstName: 'Resize', lastName: 'Card', speakerType: 'Speaker', title: 't', bio: BIO },
        ]);
        init(el);

        const desc = el.querySelector('.blade-desc');
        stubOverflow(desc, true);

        // Prove the one-shot initial sync already ran, so it can't fire again.
        await waitFor(() => el.querySelector('.blade-read-more').hidden === false);

        // Only the (manually-triggered) ResizeObserver callback can flip this now.
        stubOverflow(desc, false);
        expect(instances).to.have.lengthOf(1);
        instances[0].callback();

        await waitFor(() => el.querySelector('.blade-read-more').hidden === true);
      } finally {
        restoreRo();
        restoreRaf();
      }
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
