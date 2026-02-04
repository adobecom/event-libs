import { expect } from '@esm-bundle/chai';

import { hydrateBlocks } from '../../../event-libs/v1/hydrate/hydrate.js';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';

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
