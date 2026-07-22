import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { setEventConfig } from '../../../../event-libs/v1/utils/utils.js';
import { sessions, favorited } from '../../../../event-libs/v1/utils/session-store.js';
import init from '../../../../event-libs/v1/c2/blocks/event-marquee/event-marquee.js';

const body = await readFile({ path: './mocks/default.html' });

const localMiloLibs = 'http://localhost:2000/test/unit/blocks/event-marquee/mocks/libs';
setEventConfig({}, { miloLibs: localMiloLibs });

// Metadata lives in a sibling Section Metadata block, same convention as Milo's own
// C2 Router Marquee (`starting-marquee`) — never as rows inside the marquee itself.
function sectionMetadataHtml(rows = {}) {
  const entries = Object.entries(rows);
  if (!entries.length) return '';
  return `
    <div class="section-metadata">
      ${entries.map(([key, val]) => `<div><div>${key}</div><div>${val}</div></div>`).join('')}
    </div>
  `;
}

// Same row shape as Milo's classic marquee.js: an optional first row is the
// full-bleed background; the last row is the foreground (text + optional asset).
function videoVariantHtml({
  sessionId = 's-100', favoriteEnabled, shareEnabled, withBackground = true,
} = {}) {
  const metaRows = {};
  if (sessionId) metaRows['session-id'] = sessionId;
  if (favoriteEnabled !== undefined) metaRows['favorite-enabled'] = favoriteEnabled;
  if (shareEnabled !== undefined) metaRows['share-enabled'] = shareEnabled;

  const backgroundRow = withBackground
    ? '<div><div><picture><img src="./bg.jpg" alt=""></picture></div></div>'
    : '';

  return `
    <div class="section">
      <div class="event-marquee">
        ${backgroundRow}
        <div>
          <div>
            <h2>Live now</h2>
            <p>Join the mainstage keynote.</p>
          </div>
          <div>
            <div class="milo-video"><iframe title="video"></iframe></div>
          </div>
        </div>
      </div>
      ${sectionMetadataHtml(metaRows)}
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

    it('decorates the background row via Milo\'s decorateBlockBg', async () => {
      const el = document.querySelector('.event-marquee');
      await init(el);
      const background = el.querySelector('.event-marquee-background');
      expect(background).to.exist;
      expect(background.querySelector('picture')).to.exist;
    });

    it('tags the foreground row and text column, with no asset', async () => {
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-foreground')).to.exist;
      expect(el.querySelector('.event-marquee-text')).to.exist;
      expect(el.querySelector('.event-marquee-media')).to.not.exist;
    });

    it('does not require a sibling Section Metadata block', async () => {
      const el = document.querySelector('.event-marquee');
      expect(el.parentElement.querySelector('.section-metadata')).to.not.exist;
      await init(el);
      expect(el.querySelector('.event-marquee-actions')).to.not.exist;
    });

    it('works with no background row at all (foreground-only marquee)', async () => {
      document.body.innerHTML = `
        <div class="event-marquee">
          <div>
            <div><h2>Just text</h2></div>
          </div>
        </div>
      `;
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.classList.contains('event-marquee-text-cta')).to.be.true;
      expect(el.querySelector('.event-marquee-background')).to.not.exist;
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

    it('decorates both the background row and the foreground asset', async () => {
      document.body.innerHTML = videoVariantHtml();
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-background')).to.exist;
      expect(el.querySelector('.event-marquee-media .milo-video')).to.exist;
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

    it('works with no background row (video variant with an asset only)', async () => {
      document.body.innerHTML = videoVariantHtml({ sessionId: '', withBackground: false });
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.classList.contains('event-marquee-video')).to.be.true;
      expect(el.querySelector('.event-marquee-background')).to.not.exist;
    });

    it('preserves the original casing of session-id and event-title from Section Metadata', async () => {
      document.body.innerHTML = `
        <div class="section">
          <div class="event-marquee">
            <div>
              <div><h2>Live now</h2></div>
              <div><div class="milo-video"><iframe title="video"></iframe></div></div>
            </div>
          </div>
          <div class="section-metadata">
            <div><div>event-title</div><div>MAX2026</div></div>
            <div><div>session-id</div><div>S-AbC123</div></div>
          </div>
        </div>
      `;
      sessions.value = [{ id: 'S-AbC123', rfCode: 'rf-1' }];
      const el = document.querySelector('.event-marquee');
      await init(el);
      expect(el.querySelector('.event-marquee-favorite')).to.exist;
    });
  });
});
