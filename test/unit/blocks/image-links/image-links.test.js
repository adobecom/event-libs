import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../event-libs/v1/blocks/image-links/image-links.js';

const defaultBody = await readFile({ path: './mocks/default.html' });
const noHeaderBody = await readFile({ path: './mocks/no-header.html' });
const emptyBody = await readFile({ path: './mocks/empty.html' });

describe('Image Links Block', () => {
  describe('init', () => {
    beforeEach(() => {
      document.head.innerHTML = '';
    });

    it('should remove element if no rows are present', () => {
      document.body.innerHTML = emptyBody;
      const el = document.querySelector('.image-links');
      init(el);

      expect(document.querySelector('.image-links')).to.be.null;
    });

    it('should create image-links-wrapper container', () => {
      document.body.innerHTML = defaultBody;
      const el = document.querySelector('.image-links');
      init(el);

      const wrapper = el.querySelector('.image-links-wrapper');
      expect(wrapper).to.not.be.null;
    });

    it('should use first row as header with image-links-header class', () => {
      document.body.innerHTML = defaultBody;
      const el = document.querySelector('.image-links');
      init(el);

      const headerContainer = el.querySelector('.image-links-header');
      expect(headerContainer).to.not.be.null;

      const title = headerContainer.querySelector('h2');
      expect(title).to.not.be.null;
      expect(title.textContent).to.equal('Our Sponsors');
    });

    it('should create images container with image items', () => {
      document.body.innerHTML = defaultBody;
      const el = document.querySelector('.image-links');
      init(el);

      const imagesContainer = el.querySelector('.image-links-container');
      expect(imagesContainer).to.not.be.null;

      const imageItems = imagesContainer.querySelectorAll('.image-links-item');
      expect(imageItems).to.have.lengthOf(2);
    });

    it('should preserve links inside image items', () => {
      document.body.innerHTML = defaultBody;
      const el = document.querySelector('.image-links');
      init(el);

      const items = el.querySelectorAll('.image-links-item');
      expect(items).to.have.lengthOf(2);

      const link1 = items[0].querySelector('a');
      expect(link1).to.not.be.null;
      expect(link1.href).to.equal('https://example.com/sponsor1');
      expect(link1.target).to.equal('_blank');

      const link2 = items[1].querySelector('a');
      expect(link2).to.not.be.null;
      expect(link2.href).to.equal('https://example.com/sponsor2');
    });

    it('should preserve original target attribute from links', () => {
      document.body.innerHTML = defaultBody;
      const el = document.querySelector('.image-links');
      init(el);

      const items = el.querySelectorAll('.image-links-item');
      // First link has target="_blank"
      expect(items[0].querySelector('a').target).to.equal('_blank');
      // Second link has no target
      expect(items[1].querySelector('a').target).to.equal('');
    });

    it('should handle images without links', () => {
      document.body.innerHTML = noHeaderBody;
      const el = document.querySelector('.image-links');
      init(el);

      const imagesContainer = el.querySelector('.image-links-container');
      const directItems = imagesContainer.querySelectorAll('.image-links-item');
      expect(directItems).to.have.lengthOf(2);

      // Images should not have link wrappers
      const links = imagesContainer.querySelectorAll('a');
      expect(links).to.have.lengthOf(0);
    });

    it('should still have header row even if empty', () => {
      document.body.innerHTML = noHeaderBody;
      const el = document.querySelector('.image-links');
      init(el);

      const headerContainer = el.querySelector('.image-links-header');
      expect(headerContainer).to.not.be.null;
    });

    it('should add "single" class when only one image', () => {
      document.body.innerHTML = `
        <main>
          <div>
            <div class="image-links">
              <div>
                <div><h2>Header</h2></div>
              </div>
              <div>
                <div>
                  <picture>
                    <img loading="lazy" alt="Single Image" src="./media_single.png" width="200" height="100">
                  </picture>
                </div>
              </div>
            </div>
          </div>
        </main>
      `;
      const el = document.querySelector('.image-links');
      init(el);

      const imagesContainer = el.querySelector('.image-links-container');
      expect(imagesContainer.classList.contains('single')).to.be.true;
    });

    it('should add "odd" class when odd number of images (greater than 1)', () => {
      document.body.innerHTML = `
        <main>
          <div>
            <div class="image-links">
              <div>
                <div><h2>Header</h2></div>
              </div>
              <div>
                <div>
                  <img alt="Image 1" src="./image1.png">
                </div>
                <div>
                  <img alt="Image 2" src="./image2.png">
                </div>
                <div>
                  <img alt="Image 3" src="./image3.png">
                </div>
              </div>
            </div>
          </div>
        </main>
      `;
      const el = document.querySelector('.image-links');
      init(el);

      const imagesContainer = el.querySelector('.image-links-container');
      expect(imagesContainer.classList.contains('odd')).to.be.true;
    });

    it('should remove block if no images found', () => {
      document.body.innerHTML = `
        <main>
          <div>
            <div class="image-links">
              <div>
                <div>
                  <h2>Title Only</h2>
                </div>
              </div>
            </div>
          </div>
        </main>
      `;
      const el = document.querySelector('.image-links');
      init(el);

      expect(document.querySelector('.image-links')).to.be.null;
    });

    it('should preserve images correctly', () => {
      document.body.innerHTML = defaultBody;
      const el = document.querySelector('.image-links');
      init(el);

      const images = el.querySelectorAll('.image-links-item img');
      expect(images).to.have.lengthOf(2);
      expect(images[0].alt).to.equal('Sponsor 1');
      expect(images[1].alt).to.equal('Sponsor 2');
    });

    it('should preserve header content as-is including any elements', () => {
      document.body.innerHTML = `
        <main>
          <div>
            <div class="image-links">
              <div>
                <div>
                  <h2>Title</h2>
                  <p>Description text</p>
                  <a href="/link">Learn more</a>
                </div>
              </div>
              <div>
                <div>
                  <img alt="Image" src="./image.png">
                </div>
              </div>
            </div>
          </div>
        </main>
      `;
      const el = document.querySelector('.image-links');
      init(el);

      const headerContainer = el.querySelector('.image-links-header');
      expect(headerContainer.querySelector('h2')).to.not.be.null;
      expect(headerContainer.querySelector('p')).to.not.be.null;
      expect(headerContainer.querySelector('a')).to.not.be.null;
    });
  });
});
