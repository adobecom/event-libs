import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setEventConfig } from '../../../../event-libs/v1/utils/utils.js';
import init, { addMediaReversedClass } from '../../../../event-libs/v1/blocks/promotional-content/promotional-content.js';

describe('Promotional Content Block', () => {
  let el;
  let fetchStub;

  beforeEach(async () => {
    el = document.createElement('div');
    el.className = 'promotional-content';
    document.body.appendChild(el);

    // Mock LIBS and set up event config
    window.LIBS = '/libs';
    setEventConfig({}, { miloLibs: '/libs' });
    
    // No need to mock imports since we fixed the code to return early when no promotional items

    // Mock the promotional content JSON response - empty data for this test
    const mockPromotionalData = {
      data: [],
    };

    fetchStub = sinon.stub(window, 'fetch').resolves({ json: () => Promise.resolve(mockPromotionalData) });
  });

  afterEach(() => {
    document.body.removeChild(el);
    fetchStub.restore();
    sinon.restore();
    delete window.LIBS;
    
    // Clean up any metadata that might have been added
    const metaTags = document.head.querySelectorAll('meta[name="promotional-items"]');
    metaTags.forEach((tag) => tag.remove());
  });

  describe('init', () => {
    it('should handle empty promotional items gracefully', async () => {
      // Should not throw an error
      await init(el);

      // Fetch should not be called when there are no promotional items (early return)
      expect(fetchStub.called).to.be.false;
    });
  });

  describe('addMediaReversedClass', () => {
    it('should remove media-reverse-mobile class from all media blocks', async () => {
      // Add media blocks with media-reverse-mobile class
      const media1 = document.createElement('div');
      media1.className = 'media media-reverse-mobile';
      el.appendChild(media1);

      const media2 = document.createElement('div');
      media2.className = 'media media-reverse-mobile';
      el.appendChild(media2);

      // Set up mock metadata to ensure the function runs
      const meta = document.createElement('meta');
      meta.name = 'promotional-items';
      meta.content = '["Acrobat"]';
      document.head.appendChild(meta);

      addMediaReversedClass(el);

      const mediaBlocks = el.querySelectorAll('.media');
      mediaBlocks.forEach((block) => {
        expect(block.classList.contains('media-reverse-mobile')).to.be.false;
      });
    });

    it('should add media-reversed class to odd-indexed media blocks', async () => {
      // Add media blocks
      const media1 = document.createElement('div');
      media1.className = 'media';
      el.appendChild(media1);

      const media2 = document.createElement('div');
      media2.className = 'media';
      el.appendChild(media2);

      const media3 = document.createElement('div');
      media3.className = 'media';
      el.appendChild(media3);

      // Set up mock metadata to ensure the function runs
      const meta = document.createElement('meta');
      meta.name = 'promotional-items';
      meta.content = '["Acrobat"]';
      document.head.appendChild(meta);

      addMediaReversedClass(el);

      const mediaBlocks = el.querySelectorAll('.media');

      expect(mediaBlocks[0].classList.contains('media-reversed')).to.be.false;
      expect(mediaBlocks[1].classList.contains('media-reversed')).to.be.true;
      expect(mediaBlocks[2].classList.contains('media-reversed')).to.be.false;
    });
  });

  describe('getPromotionalContent', () => {
    it('should handle invalid JSON in promotional items metadata', async () => {
      // Set up invalid metadata
      const meta = document.createElement('meta');
      meta.name = 'promotional-items';
      meta.content = 'invalid json';
      document.head.appendChild(meta);

      // Should not throw an error
      await init(el);

      // Fetch should not be called with invalid metadata (early return due to empty promotional items)
      expect(fetchStub.called).to.be.false;
    });
  });
});
