import { expect } from '@esm-bundle/chai';

import {
  hydrateBlocks,
  registerHydrator,
  resetHydrators,
} from '../../../event-libs/v1/hydrate/hydrate.js';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import * as libs from '../../../event-libs/v1/libs.js';

// The registry is module state, so every describe that registers must clean up or it
// leaks into later tests — including ones in other files.
afterEach(() => {
  resetHydrators();
});

describe('hydrateBlocks', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('should hydrate image-links block with sponsors metadata', async () => {
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
      <div class="image-links hydrate sponsors gold">
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

  it('should filter sponsors by tier', async () => {
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
      <div class="image-links hydrate sponsors gold">
        <div><div><h2>Gold Sponsors</h2></div></div>
      </div>
    `;

    hydrateBlocks(document);

    const block = document.querySelector('.image-links');
    const images = block.querySelectorAll('img');
    expect(images).to.have.lengthOf(1);
    expect(images[0].src).to.equal('https://example.com/gold.jpg');
  });

  it('should not hydrate block without hydrate class', async () => {
    setMetadata('sponsors', JSON.stringify([
      {
        name: 'Sponsor 1',
        image: { imageUrl: 'https://example.com/sponsor1.jpg' },
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
    expect(images).to.have.lengthOf(0);
  });

  it('should not hydrate block without sponsors class', async () => {
    setMetadata('sponsors', JSON.stringify([
      {
        name: 'Sponsor 1',
        image: { imageUrl: 'https://example.com/sponsor1.jpg' },
      },
    ]));

    document.body.innerHTML = `
      <div class="image-links hydrate">
        <div><div><h2>Images</h2></div></div>
      </div>
    `;

    hydrateBlocks(document);

    const block = document.querySelector('.image-links');
    const images = block.querySelectorAll('img');
    expect(images).to.have.lengthOf(0);
  });

  it('should wrap sponsor image in link when link is provided', async () => {
    setMetadata('sponsors', JSON.stringify([
      {
        name: 'Sponsor With Link',
        image: { imageUrl: 'https://example.com/sponsor.jpg' },
        link: 'https://sponsor.com',
        sponsorType: 'platinum',
      },
    ]));

    document.body.innerHTML = `
      <div class="image-links hydrate sponsors platinum">
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

  it('should not add link when sponsor has no link', async () => {
    setMetadata('sponsors', JSON.stringify([
      {
        name: 'Sponsor Without Link',
        image: { imageUrl: 'https://example.com/sponsor.jpg' },
        sponsorType: 'bronze',
      },
    ]));

    document.body.innerHTML = `
      <div class="image-links hydrate sponsors bronze">
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

  it('should handle invalid JSON in metadata gracefully', async () => {
    setMetadata('sponsors', 'invalid JSON');

    document.body.innerHTML = `
      <div class="image-links hydrate sponsors gold">
        <div><div><h2>Gold Sponsors</h2></div></div>
      </div>
    `;

    // Should not throw
    hydrateBlocks(document);

    const block = document.querySelector('.image-links');
    const images = block.querySelectorAll('img');
    expect(images).to.have.lengthOf(0);
  });

  it('should handle empty sponsors array', async () => {
    setMetadata('sponsors', JSON.stringify([]));

    document.body.innerHTML = `
      <div class="image-links hydrate sponsors gold">
        <div><div><h2>Gold Sponsors</h2></div></div>
      </div>
    `;

    hydrateBlocks(document);

    const block = document.querySelector('.image-links');
    const images = block.querySelectorAll('img');
    expect(images).to.have.lengthOf(0);
  });

  it('should skip sponsors without image data', async () => {
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
      <div class="image-links hydrate sponsors gold">
        <div><div><h2>Gold Sponsors</h2></div></div>
      </div>
    `;

    hydrateBlocks(document);

    const block = document.querySelector('.image-links');
    const images = block.querySelectorAll('img');
    expect(images).to.have.lengthOf(1);
  });

  it('should set alt text from sponsor name', async () => {
    setMetadata('sponsors', JSON.stringify([
      {
        name: 'My Sponsor Name',
        image: { imageUrl: 'https://example.com/sponsor.jpg' },
        sponsorType: 'silver',
      },
    ]));

    document.body.innerHTML = `
      <div class="image-links hydrate sponsors silver">
        <div><div><h2>Silver Sponsors</h2></div></div>
      </div>
    `;

    hydrateBlocks(document);

    const block = document.querySelector('.image-links');
    const img = block.querySelector('img');
    expect(img.alt).to.equal('My Sponsor Name');
  });

  it('should handle blocks without a matching hydrator gracefully', async () => {
    document.body.innerHTML = `
      <div class="nonexistent-block hydrate">
        <div><div>Content</div></div>
      </div>
    `;

    // Should not throw even when hydrator doesn't exist
    hydrateBlocks(document);

    const block = document.querySelector('.nonexistent-block');
    expect(block).to.not.be.null;
  });

  it('should hydrate multiple blocks', async () => {
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
      <div class="image-links hydrate sponsors gold">
        <div><div><h2>Gold Sponsors</h2></div></div>
      </div>
      <div class="image-links hydrate sponsors silver">
        <div><div><h2>Silver Sponsors</h2></div></div>
      </div>
    `;

    hydrateBlocks(document);

    const blocks = document.querySelectorAll('.image-links');
    expect(blocks).to.have.lengthOf(2);

    const goldBlock = document.querySelector('.image-links.gold');
    const silverBlock = document.querySelector('.image-links.silver');

    expect(goldBlock.querySelectorAll('img')).to.have.lengthOf(1);
    expect(silverBlock.querySelectorAll('img')).to.have.lengthOf(1);
  });
});

describe('consumer hydrator registration', () => {
  let lanaLogs;
  let originalLog;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    lanaLogs = [];
    originalLog = window.lana?.log;
    window.lana = { ...window.lana, log: (msg) => lanaLogs.push(msg) };
  });

  afterEach(() => {
    if (originalLog) window.lana.log = originalLog;
  });

  it('calls a hydrator registered as a function', () => {
    let received = null;
    registerHydrator('custom-consumer-block', (block) => {
      received = block;
      // Not `dataset.hydrated` — that is hydrateBlocks' own bookkeeping flag, so
      // asserting on it would pass even for a hydrator that never ran.
      block.dataset.ranHydrator = 'true';
    });

    document.body.innerHTML = '<div class="custom-consumer-block hydrate"></div>';

    hydrateBlocks(document);

    const block = document.querySelector('.custom-consumer-block');
    expect(received).to.equal(block);
    expect(block.dataset.ranHydrator).to.equal('true');
  });

  it('prefers a registered hydrator over the built-in one', () => {
    registerHydrator('image-links', (block) => {
      block.dataset.hydratedBy = 'override';
    });

    document.body.innerHTML = '<div class="image-links hydrate sponsors gold"></div>';

    hydrateBlocks(document);

    expect(document.querySelector('.image-links').dataset.hydratedBy).to.equal('override');
  });

  it('rejects a registration that is not a function', () => {
    expect(registerHydrator('incomplete-block', './some/module.js')).to.be.false;

    document.body.innerHTML = '<div class="incomplete-block hydrate"></div>';

    hydrateBlocks(document);

    expect(lanaLogs.some((msg) => msg.includes('needs a function'))).to.be.true;
    expect(lanaLogs.some((msg) => msg.includes('Hydrator not found for block: incomplete-block'))).to.be.true;
  });

  it('rejects an async hydrator, which would hydrate too late', () => {
    expect(registerHydrator('async-block', async (block) => {
      block.dataset.hydrated = 'late';
    })).to.be.false;

    document.body.innerHTML = '<div class="async-block hydrate"></div>';

    hydrateBlocks(document);

    expect(lanaLogs.some((msg) => msg.includes('rejected an async function'))).to.be.true;
    expect(document.querySelector('.async-block').dataset.hydrated).to.equal(undefined);
  });

  it('returns true and warns when replacing an existing registration', () => {
    expect(registerHydrator('replaceable-block', () => {})).to.be.true;
    expect(registerHydrator('replaceable-block', (block) => {
      block.dataset.hydratedBy = 'second';
    })).to.be.true;

    document.body.innerHTML = '<div class="replaceable-block hydrate"></div>';

    hydrateBlocks(document);

    expect(lanaLogs.some((msg) => msg.includes('replaced an existing registration'))).to.be.true;
    expect(document.querySelector('.replaceable-block').dataset.hydratedBy).to.equal('second');
  });

  it('distinguishes a throwing hydrator from a missing one', () => {
    registerHydrator('throwing-block', () => {
      throw new Error('boom');
    });

    document.body.innerHTML = `
      <div class="throwing-block hydrate"></div>
      <div class="missing-hydrator-block hydrate"></div>
    `;

    hydrateBlocks(document);

    expect(lanaLogs).to.include('Hydrator failed for block throwing-block: boom');
    expect(lanaLogs).to.include('Hydrator not found for block: missing-hydrator-block');
  });

  it('continues hydrating later blocks after one throws', () => {
    registerHydrator('bad-block', () => {
      throw new Error('boom');
    });
    registerHydrator('good-block', (block) => {
      block.dataset.hydrated = 'true';
    });

    document.body.innerHTML = `
      <div class="bad-block hydrate"></div>
      <div class="good-block hydrate"></div>
    `;

    hydrateBlocks(document);

    expect(document.querySelector('.good-block').dataset.hydrated).to.equal('true');
  });
});

describe('hydration is synchronous', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  // Guards against reintroducing a dynamic import or async hydrator, either of which
  // would race block init on the fragment/personalization paths.
  it('completes before hydrateBlocks returns', () => {
    setMetadata('sponsors', JSON.stringify([
      { name: 'Sponsor 1', image: { imageUrl: 'https://example.com/1.jpg' }, sponsorType: 'gold' },
      { name: 'Sponsor 2', image: { imageUrl: 'https://example.com/2.jpg' }, sponsorType: 'gold' },
    ]));

    document.body.innerHTML = `
      <div class="image-links hydrate sponsors gold">
        <div><div><h2>Gold Sponsors</h2></div></div>
      </div>
    `;

    hydrateBlocks(document);

    // Asserted on the very next statement, with no await in between
    const block = document.querySelector('.image-links');
    expect(block.querySelectorAll('img')).to.have.lengthOf(2);
  });

  it('returns undefined rather than a promise', () => {
    document.body.innerHTML = '<div class="image-links hydrate sponsors gold"></div>';
    expect(hydrateBlocks(document)).to.equal(undefined);
  });
});

describe('hydration logging', () => {
  // Hydration runs before consumers call loadLana, so window.lana does not exist yet.
  it('buffers a message until lana is available instead of dropping it', async () => {
    const originalLana = window.lana;
    delete window.lana;

    document.body.innerHTML = '<div class="no-hydrator-block hydrate"></div>';

    hydrateBlocks(document);

    const logs = [];
    window.lana = { log: (msg) => logs.push(msg) };
    window.dispatchEvent(new Event('load'));
    await Promise.resolve();

    expect(logs).to.include('Hydrator not found for block: no-hydrator-block');
    window.lana = originalLana;
  });
});

describe('hydration runs once per block', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  // decorateEvent runs again for nested areas (fragments, personalization). Without a
  // guard, a second pass would wipe the DOM the block's init() already built.
  it('skips a block that has already been hydrated', () => {
    let calls = 0;
    registerHydrator('once-block', () => { calls += 1; });

    document.body.innerHTML = '<div class="once-block hydrate"></div>';

    hydrateBlocks(document);
    hydrateBlocks(document);

    expect(calls).to.equal(1);
    expect(document.querySelector('.once-block').getAttribute('data-hydrated')).to.equal('true');
  });

  it('preserves initialized DOM when a later pass covers the block again', () => {
    registerHydrator('reentrant-block', (block) => {
      block.append(document.createElement('div'));
    });

    document.body.innerHTML = '<div class="reentrant-block hydrate"></div>';

    hydrateBlocks(document);
    const block = document.querySelector('.reentrant-block');

    // Stand in for a block init() that relocates its rows into a wrapper
    const section = document.createElement('section');
    block.querySelector(':scope > div').append(section);

    hydrateBlocks(document);

    expect(block.querySelectorAll('section')).to.have.lengthOf(1);
    expect(block.querySelectorAll(':scope > div')).to.have.lengthOf(1);
  });

  it('retries a block whose hydrator returned false', () => {
    let calls = 0;
    registerHydrator('bailed-block', () => {
      calls += 1;
      return false;
    });

    document.body.innerHTML = '<div class="bailed-block hydrate"></div>';

    hydrateBlocks(document);
    hydrateBlocks(document);

    // A bail-out often means the data wasn't there yet, so a later pass should retry
    expect(calls).to.equal(2);
    expect(document.querySelector('.bailed-block').hasAttribute('data-hydrated')).to.be.false;
  });

  it('marks a hydrator that returns nothing as done', () => {
    let calls = 0;
    registerHydrator('void-block', () => { calls += 1; });

    document.body.innerHTML = '<div class="void-block hydrate"></div>';

    hydrateBlocks(document);
    hydrateBlocks(document);

    expect(calls).to.equal(1);
  });

  it('retries a block whose hydrator threw', () => {
    let calls = 0;
    registerHydrator('retry-block', () => {
      calls += 1;
      throw new Error('boom');
    });

    document.body.innerHTML = '<div class="retry-block hydrate"></div>';

    hydrateBlocks(document);
    hydrateBlocks(document);

    expect(calls).to.equal(2);
    expect(document.querySelector('.retry-block').hasAttribute('data-hydrated')).to.be.false;
  });
});

/**
 * libs.js is the barrel consumers import. Anything they read off it by name is public
 * API — dropping an export breaks them silently, since their feature detection just
 * turns the feature off. These assertions pin that surface.
 */
describe('libs.js hydration exports', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  ['registerHydrator', 'repeatTemplate', 'decorateEvent'].forEach((name) => {
    it(`exports ${name} as a function`, () => {
      expect(libs[name], `${name} is missing from libs.js`).to.be.a('function');
    });
  });

  it('drives the consumer hydration flow through the barrel alone', () => {
    document.body.innerHTML = '<div class="barrel-block hydrate"><div><div>[[widgets.name]]</div></div></div>';
    libs.setMetadata('widgets', JSON.stringify([{ name: 'A' }, { name: 'B' }]));

    expect(libs.registerHydrator(
      'barrel-block',
      (block) => libs.repeatTemplate(block, { selectItems: (items) => items }),
    )).to.be.true;

    hydrateBlocks(document);

    const rows = document.querySelectorAll('.barrel-block > div');
    expect(rows).to.have.lengthOf(2);
    expect([...rows].map((row) => row.innerHTML.trim()))
      .to.deep.equal(['<div>[[widgets:0.name]]</div>', '<div>[[widgets:1.name]]</div>']);
  });
});
