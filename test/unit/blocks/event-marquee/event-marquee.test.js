import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { setEventConfig } from '../../../../event-libs/v1/utils/utils.js';
import { sessions, favorited } from '../../../../event-libs/v1/utils/session-store.js';
import init from '../../../../event-libs/v1/c2/blocks/event-marquee/event-marquee.js';

const body = await readFile({ path: './mocks/default.html' });

const localMiloLibs = 'http://localhost:2000/test/unit/blocks/event-marquee/mocks/libs';
setEventConfig({}, { miloLibs: localMiloLibs });

function videoVariantHtml({ sessionId = 's-100', favoriteEnabled, shareEnabled } = {}) {
  const metaRows = [
    `<div><div>session-id</div><div>${sessionId}</div></div>`,
    favoriteEnabled !== undefined ? `<div><div>favorite-enabled</div><div>${favoriteEnabled}</div></div>` : '',
    shareEnabled !== undefined ? `<div><div>share-enabled</div><div>${shareEnabled}</div></div>` : '',
  ].join('');

  return `
    <div class="event-marquee">
      <div>
        <div>
          <h2>Live now</h2>
          <p>Join the mainstage keynote.</p>
        </div>
        <div>
          <div class="milo-video"><iframe title="video"></iframe></div>
        </div>
      </div>
      ${metaRows}
    </div>
  `;
}

describe('event-marquee', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    sessions.value = [];
    favorited.value = new Set();
  });

  describe('Text/CTA variant', () => {
    beforeEach(() => {
      document.body.innerHTML = body;
    });

    it('renders the text-cta variant when no player is present', async () => {
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.classList.contains('event-marquee-text-cta')).to.be.true;
      expect(el.classList.contains('event-marquee-video')).to.be.false;
    });

    it('decorates CTAs via decorateButtons', async () => {
      const el = document.querySelector('.event-marquee');
      await init(el);
      const primary = el.querySelector('em > strong > a');
      const secondary = el.querySelector('em > a');
      expect(primary.classList.contains('con-button')).to.be.true;
      expect(secondary.classList.contains('con-button')).to.be.true;
    });

    it('renders no Favorite/share actions bar', async () => {
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-actions')).to.not.exist;
    });

    it('tags the text and media columns', async () => {
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-text')).to.exist;
      expect(el.querySelector('.event-marquee-media')).to.exist;
    });
  });

  describe('Video variant', () => {
    it('renders the video variant when a decorated player is present', async () => {
      document.body.innerHTML = videoVariantHtml();
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.classList.contains('event-marquee-video')).to.be.true;
      expect(el.classList.contains('event-marquee-text-cta')).to.be.false;
    });

    it('strips authoring metadata rows before rendering', async () => {
      document.body.innerHTML = videoVariantHtml();
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelectorAll(':scope > div').length).to.equal(1);
    });

    it('renders a Favorite button when the authored session-id matches a known session', async () => {
      sessions.value = [{ id: 's-100', rfCode: 'rf-100' }];
      document.body.innerHTML = videoVariantHtml({ sessionId: 's-100' });
      const el = document.querySelector('.event-marquee');
      await init(el);

      const favoriteBtn = el.querySelector('.event-marquee-favorite');
      expect(favoriteBtn).to.exist;
      expect(favoriteBtn.getAttribute('aria-label')).to.equal('Add to favorites');
      expect(favoriteBtn.classList.contains('is-favorited')).to.be.false;
    });

    it('reflects the favorited signal reactively', async () => {
      sessions.value = [{ id: 's-100', rfCode: 'rf-100' }];
      document.body.innerHTML = videoVariantHtml({ sessionId: 's-100' });
      const el = document.querySelector('.event-marquee');
      await init(el);

      favorited.value = new Set(['s-100']);
      const favoriteBtn = el.querySelector('.event-marquee-favorite');
      expect(favoriteBtn.classList.contains('is-favorited')).to.be.true;
      expect(favoriteBtn.getAttribute('aria-label')).to.equal('Remove from favorites');
    });

    it('does not render a Favorite button when no session-id is authored', async () => {
      document.body.innerHTML = videoVariantHtml({ sessionId: '' });
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-favorite')).to.not.exist;
    });

    it('does not render a Favorite button when favorite-enabled is explicitly false', async () => {
      sessions.value = [{ id: 's-100', rfCode: 'rf-100' }];
      document.body.innerHTML = videoVariantHtml({ sessionId: 's-100', favoriteEnabled: false });
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-favorite')).to.not.exist;
    });

    it('renders a share button by default', async () => {
      document.body.innerHTML = videoVariantHtml({ sessionId: '' });
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-share')).to.exist;
    });

    it('omits the share button when share-enabled is explicitly false', async () => {
      document.body.innerHTML = videoVariantHtml({ sessionId: '', shareEnabled: false });
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-share')).to.not.exist;
    });
  });
});
