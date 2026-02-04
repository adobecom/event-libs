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

    it('should extract and display header', () => {
      document.body.innerHTML = defaultBody;
      const el = document.querySelector('.image-links');
      init(el);

      const headerContainer = el.querySelector('.image-links-header');
      expect(headerContainer).to.not.be.null;

      const title = headerContainer.querySelector('.image-links-title');
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

    it('should wrap images with links when available', () => {
      document.body.innerHTML = defaultBody;
      const el = document.querySelector('.image-links');
      init(el);

      const links = el.querySelectorAll('.image-links-container > a');
      expect(links).to.have.lengthOf(2);
      expect(links[0].href).to.equal('https://example.com/sponsor1');
      expect(links[0].target).to.equal('_blank');
      expect(links[1].href).to.equal('https://example.com/sponsor2');
    });

    it('should handle images without links', () => {
      document.body.innerHTML = noHeaderBody;
      const el = document.querySelector('.image-links');
      init(el);

      const imagesContainer = el.querySelector('.image-links-container');
      const directItems = imagesContainer.querySelectorAll(':scope > .image-links-item');
      expect(directItems).to.have.lengthOf(2);
    });

    it('should not add header container if no header found', () => {
      document.body.innerHTML = noHeaderBody;
      const el = document.querySelector('.image-links');
      init(el);

      const headerContainer = el.querySelector('.image-links-header');
      expect(headerContainer).to.be.null;
    });

    it('should add "single" class when only one image', () => {
      document.body.innerHTML = `
        <main>
          <div>
            <div class="image-links">
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
                <div>
                  <img alt="Image 1" src="./image1.png">
                </div>
              </div>
              <div>
                <div>
                  <img alt="Image 2" src="./image2.png">
                </div>
              </div>
              <div>
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

    it('should clone images correctly', () => {
      document.body.innerHTML = defaultBody;
      const el = document.querySelector('.image-links');
      init(el);

      const images = el.querySelectorAll('.image-links-item img');
      expect(images).to.have.lengthOf(2);
      expect(images[0].alt).to.equal('Sponsor 1');
      expect(images[1].alt).to.equal('Sponsor 2');
    });
  });
});
