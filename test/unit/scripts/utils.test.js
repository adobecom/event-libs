import { expect } from '@esm-bundle/chai';

import {
  createTag,
  yieldToMain,
  getMetadata,
  setMetadata,
  handlize,
  flattenObject,
  createOptimizedPicture,
  getIcon,
  getImageSource,
  hydrateBlocks,
} from '../../../event-libs/v1/utils/utils.js';

describe('Utility Functions', () => {
  describe('createTag', () => {
    it('should create a tag with given attributes and inner HTML', () => {
      const el = createTag('div', { class: 'test-class' }, '<p>Test</p>');
      expect(el.tagName).to.equal('DIV');
      expect(el.getAttribute('class')).to.equal('test-class');
      expect(el.innerHTML).to.equal('<p>Test</p>');
    });

    it('should append HTMLElement as inner HTML', () => {
      const innerEl = document.createElement('p');
      innerEl.textContent = 'Test';
      const el = createTag('div', {}, innerEl);
      expect(el.innerHTML).to.equal('<p>Test</p>');
    });

    it('should append array of HTMLElements as inner HTML', () => {
      const innerEl1 = document.createElement('p');
      innerEl1.textContent = 'Test1';
      const innerEl2 = document.createElement('p');
      innerEl2.textContent = 'Test2';
      const el = createTag('div', {}, [innerEl1, innerEl2]);
      expect(el.innerHTML).to.equal('<p>Test1</p><p>Test2</p>');
    });

    it('should set attributes correctly', () => {
      const el = createTag('input', { type: 'text', placeholder: 'Enter text' });
      expect(el.getAttribute('type')).to.equal('text');
      expect(el.getAttribute('placeholder')).to.equal('Enter text');
    });

    it('should append to parent element if provided', () => {
      const parent = document.createElement('div');
      const el = createTag('span', {}, 'Test', { parent });
      expect(parent.children).to.have.lengthOf(1);
      expect(parent.firstChild).to.equal(el);
    });
  });

  describe('yieldToMain', () => {
    it('should resolve after a timeout', async () => {
      const start = Date.now();
      await yieldToMain();
      const end = Date.now();
      expect(end - start).to.be.at.least(0); // At least 0ms delay
    });
  });

  describe('getMetadata', () => {
    it('should return meta content for given name', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      meta.content = 'Test description';
      document.head.appendChild(meta);
      expect(getMetadata('description')).to.equal('Test description');
      document.head.removeChild(meta);
    });

    it('should return null if meta tag does not exist', () => {
      expect(getMetadata('nonexistent')).to.be.null;
    });
  });

  describe('setMetadata', () => {
    it('should set meta content for given name', () => {
      setMetadata('description', 'New description');
      const meta = document.head.querySelector('meta[name="description"]');
      expect(meta).to.not.be.null;
      expect(meta.content).to.equal('New description');
      document.head.removeChild(meta);
    });

    it('should create new meta tag if it does not exist', () => {
      setMetadata('keywords', 'test, keywords');
      const meta = document.head.querySelector('meta[name="keywords"]');
      expect(meta).to.not.be.null;
      expect(meta.content).to.equal('test, keywords');
      document.head.removeChild(meta);
    });
  });

  describe('handlize', () => {
    it('should convert string to handle format', () => {
      expect(handlize('  Test String  ')).to.equal('test-string');
      expect(handlize('Another Test')).to.equal('another-test');
    });
  });

  describe('flattenObject', () => {
    it('should flatten nested objects', () => {
      const obj = {
        a: {
          b: {
            c: 1,
            d: 2,
          },
        },
        e: 3,
      };
      const result = flattenObject(obj);
      expect(result).to.deep.equal({
        'a.b.c': 1,
        'a.b.d': 2,
        e: 3,
      });
    });

    it('should handle arrays within objects', () => {
      const obj = { a: [1, 2, { b: 3 }] };
      const result = flattenObject(obj);
      expect(result).to.deep.equal({
        'a[0]': 1,
        'a[1]': 2,
        'a[2].b': 3,
      });
    });

    it('should handle arbitrary arrays', () => {
      const obj = {
        arbitrary: [
          { key: 'test', value: 'value' },
        ],
      };
      const result = flattenObject(obj);
      expect(result).to.deep.equal({ 'arbitrary.test': 'value' });
    });
  });

  describe('createOptimizedPicture', () => {
    it('should create a picture element with sources and img', () => {
      const picture = createOptimizedPicture('https://www.adobe.com/image.jpg', 'Test Image', true, false);
      expect(picture.tagName).to.equal('PICTURE');
      const sources = picture.querySelectorAll('source');
      const img = picture.querySelector('img');
      expect(sources).to.have.lengthOf(3);
      expect(img).to.not.be.null;
      expect(img.getAttribute('alt')).to.equal('Test Image');
    });
  });

  describe('getIcon', () => {
    it('should create an img element with correct attributes', () => {
      const icon = getIcon('test-icon');
      expect(icon.tagName).to.equal('IMG');
      expect(icon.className).to.equal('icon icon-test-icon');
      expect(icon.getAttribute('src')).to.include('event-libs/v1/icons/test-icon.svg');
      expect(icon.getAttribute('alt')).to.equal('test-icon');
    });
  });

  describe('getImageSource', () => {
    it('should return empty string for null input', () => {
      expect(getImageSource(null)).to.equal('');
    });

    it('should return empty string for undefined input', () => {
      expect(getImageSource(undefined)).to.equal('');
    });

    it('should return sharepointUrl when available', () => {
      const photo = {
        sharepointUrl: 'https://sharepoint.example.com/image.jpg',
        imageUrl: 'https://example.com/image.jpg',
      };
      expect(getImageSource(photo)).to.equal('https://sharepoint.example.com/image.jpg');
    });

    it('should return imageUrl when sharepointUrl is not available', () => {
      const photo = {
        imageUrl: 'https://example.com/image.jpg',
      };
      expect(getImageSource(photo)).to.equal('https://example.com/image.jpg');
    });

    it('should return empty string when neither URL is available', () => {
      const photo = {};
      expect(getImageSource(photo)).to.equal('');
    });
  });

  describe('hydrateBlocks', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
      document.head.innerHTML = '';
    });

    it('should hydrate image-links block with sponsors metadata', () => {
      setMetadata('sponsors', JSON.stringify([
        {
          name: 'Sponsor 1',
          image: { imageUrl: 'https://example.com/sponsor1.jpg' },
          link: 'https://sponsor1.com',
          sponsorType: 'gold',
        },
        {
          name: 'Sponsor 2',
          image: { imageUrl: 'https://example.com/sponsor2.jpg' },
          link: 'https://sponsor2.com',
          sponsorType: 'gold',
        },
      ]));

      document.body.innerHTML = `
        <div class="image-links sponsors gold">
          <div><div><h2>Gold Sponsors</h2></div></div>
        </div>
      `;

      hydrateBlocks(document);

      const block = document.querySelector('.image-links');
      const rows = block.querySelectorAll(':scope > div');
      // Original row + 2 sponsor rows
      expect(rows.length).to.be.at.least(2);

      const images = block.querySelectorAll('img');
      expect(images).to.have.lengthOf(2);
      expect(images[0].src).to.equal('https://example.com/sponsor1.jpg');
      expect(images[1].src).to.equal('https://example.com/sponsor2.jpg');
    });

    it('should filter sponsors by tier', () => {
      setMetadata('sponsors', JSON.stringify([
        {
          name: 'Gold Sponsor',
          image: { imageUrl: 'https://example.com/gold.jpg' },
          sponsorType: 'gold',
        },
        {
          name: 'Silver Sponsor',
          image: { imageUrl: 'https://example.com/silver.jpg' },
          sponsorType: 'silver',
        },
      ]));

      document.body.innerHTML = `
        <div class="image-links sponsors gold">
          <div><div><h2>Gold Sponsors</h2></div></div>
        </div>
      `;

      hydrateBlocks(document);

      const block = document.querySelector('.image-links');
      const images = block.querySelectorAll('img');
      expect(images).to.have.lengthOf(1);
      expect(images[0].src).to.equal('https://example.com/gold.jpg');
    });

    it('should not hydrate block without sponsors class', () => {
      setMetadata('sponsors', JSON.stringify([
        {
          name: 'Sponsor 1',
          image: { imageUrl: 'https://example.com/sponsor1.jpg' },
        },
      ]));

      document.body.innerHTML = `
        <div class="image-links">
          <div><div><h2>Images</h2></div></div>
        </div>
      `;

      hydrateBlocks(document);

      const block = document.querySelector('.image-links');
      const images = block.querySelectorAll('img');
      expect(images).to.have.lengthOf(0);
    });

    it('should wrap sponsor image in link when link is provided', () => {
      setMetadata('sponsors', JSON.stringify([
        {
          name: 'Sponsor With Link',
          image: { imageUrl: 'https://example.com/sponsor.jpg' },
          link: 'https://sponsor.com',
          sponsorType: 'platinum',
        },
      ]));

      document.body.innerHTML = `
        <div class="image-links sponsors platinum">
          <div><div><h2>Platinum Sponsors</h2></div></div>
        </div>
      `;

      hydrateBlocks(document);

      const block = document.querySelector('.image-links');
      const link = block.querySelector('a');
      expect(link).to.not.be.null;
      expect(link.href).to.equal('https://sponsor.com/');
      expect(link.target).to.equal('_blank');
      expect(link.rel).to.equal('noopener noreferrer');
      expect(link.title).to.equal('Sponsor With Link');
    });

    it('should not add link when sponsor has no link', () => {
      setMetadata('sponsors', JSON.stringify([
        {
          name: 'Sponsor Without Link',
          image: { imageUrl: 'https://example.com/sponsor.jpg' },
          sponsorType: 'bronze',
        },
      ]));

      document.body.innerHTML = `
        <div class="image-links sponsors bronze">
          <div><div><h2>Bronze Sponsors</h2></div></div>
        </div>
      `;

      hydrateBlocks(document);

      const block = document.querySelector('.image-links');
      const links = block.querySelectorAll('a');
      expect(links).to.have.lengthOf(0);

      const images = block.querySelectorAll('img');
      expect(images).to.have.lengthOf(1);
    });

    it('should handle invalid JSON in metadata gracefully', () => {
      setMetadata('sponsors', 'invalid JSON');

      document.body.innerHTML = `
        <div class="image-links sponsors gold">
          <div><div><h2>Gold Sponsors</h2></div></div>
        </div>
      `;

      // Should not throw
      expect(() => hydrateBlocks(document)).to.not.throw();

      const block = document.querySelector('.image-links');
      const images = block.querySelectorAll('img');
      expect(images).to.have.lengthOf(0);
    });

    it('should handle empty sponsors array', () => {
      setMetadata('sponsors', JSON.stringify([]));

      document.body.innerHTML = `
        <div class="image-links sponsors gold">
          <div><div><h2>Gold Sponsors</h2></div></div>
        </div>
      `;

      hydrateBlocks(document);

      const block = document.querySelector('.image-links');
      const images = block.querySelectorAll('img');
      expect(images).to.have.lengthOf(0);
    });

    it('should skip sponsors without image data', () => {
      setMetadata('sponsors', JSON.stringify([
        {
          name: 'Sponsor Without Image',
          link: 'https://sponsor.com',
          sponsorType: 'gold',
        },
        {
          name: 'Sponsor With Image',
          image: { imageUrl: 'https://example.com/sponsor.jpg' },
          sponsorType: 'gold',
        },
      ]));

      document.body.innerHTML = `
        <div class="image-links sponsors gold">
          <div><div><h2>Gold Sponsors</h2></div></div>
        </div>
      `;

      hydrateBlocks(document);

      const block = document.querySelector('.image-links');
      const images = block.querySelectorAll('img');
      expect(images).to.have.lengthOf(1);
    });

    it('should set alt text from sponsor name', () => {
      setMetadata('sponsors', JSON.stringify([
        {
          name: 'My Sponsor Name',
          image: { imageUrl: 'https://example.com/sponsor.jpg' },
          sponsorType: 'silver',
        },
      ]));

      document.body.innerHTML = `
        <div class="image-links sponsors silver">
          <div><div><h2>Silver Sponsors</h2></div></div>
        </div>
      `;

      hydrateBlocks(document);

      const block = document.querySelector('.image-links');
      const img = block.querySelector('img');
      expect(img.alt).to.equal('My Sponsor Name');
    });
  });
});
