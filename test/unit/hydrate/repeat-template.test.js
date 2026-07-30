import { expect } from '@esm-bundle/chai';

import repeatTemplate from '../../../event-libs/v1/hydrate/repeat-template.js';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';

describe('repeatTemplate', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  const author = (row) => {
    document.body.innerHTML = `<div class="my-block hydrate">${row}</div>`;
    return document.querySelector('.my-block');
  };

  const tokensIn = (block) => [...block.innerHTML.matchAll(/\[\[(.*?)\]\]/g)].map((m) => m[1]);

  it('repeats the template row once per item', () => {
    setMetadata('widgets', JSON.stringify([{ name: 'A' }, { name: 'B' }, { name: 'C' }]));
    const block = author('<div><div>[[widgets.name]]</div></div>');

    expect(repeatTemplate(block)).to.be.true;
    expect(block.querySelectorAll(':scope > div')).to.have.lengthOf(3);
  });

  it('indexes each clone by its position in the metadata array', () => {
    setMetadata('widgets', JSON.stringify([{ name: 'A' }, { name: 'B' }]));
    const block = author('<div><div>[[widgets.name]]</div></div>');

    repeatTemplate(block);

    expect(tokensIn(block)).to.deep.equal(['widgets:0.name', 'widgets:1.name']);
  });

  it('rewrites multiple tokens in the same row', () => {
    setMetadata('widgets', JSON.stringify([{ first: 'A', last: 'B' }]));
    const block = author('<div><div>[[widgets.first]] [[widgets.last]]</div></div>');

    repeatTemplate(block);

    expect(tokensIn(block)).to.deep.equal(['widgets:0.first', 'widgets:0.last']);
  });

  it('rewrites a bare collection token', () => {
    setMetadata('widgets', JSON.stringify(['A', 'B']));
    const block = author('<div><div>[[widgets]]</div></div>');

    repeatTemplate(block);

    expect(tokensIn(block)).to.deep.equal(['widgets:0', 'widgets:1']);
  });

  it('rewrites image tokens carried in the alt attribute', () => {
    setMetadata('widgets', JSON.stringify([{ photo: {} }, { photo: {} }]));
    const block = author('<div><div><picture><img src="./m.jpg?w=1" alt="[[widgets.photo]]"></picture></div></div>');

    repeatTemplate(block);

    const alts = [...block.querySelectorAll('img')].map((img) => img.alt);
    expect(alts).to.deep.equal(['[[widgets:0.photo]]', '[[widgets:1.photo]]']);
  });

  it('copies static authored content to every clone', () => {
    setMetadata('widgets', JSON.stringify([{ name: 'A' }, { name: 'B' }]));
    const block = author('<div><div>[[widgets.name]]</div><div>Read more</div></div>');

    repeatTemplate(block);

    const labels = [...block.querySelectorAll(':scope > div > div:nth-child(2)')]
      .map((cell) => cell.textContent);
    expect(labels).to.deep.equal(['Read more', 'Read more']);
  });

  it('applies a selectItems filter and order', () => {
    setMetadata('widgets', JSON.stringify([
      { name: 'A', keep: false },
      { name: 'B', keep: true },
      { name: 'C', keep: true },
    ]));
    const block = author('<div><div>[[widgets.name]]</div></div>');

    repeatTemplate(block, {
      selectItems: (items) => items.filter((i) => i.keep).reverse(),
    });

    expect(tokensIn(block)).to.deep.equal(['widgets:2.name', 'widgets:1.name']);
  });

  it('leaves a token that already carries an index alone', () => {
    setMetadata('widgets', JSON.stringify([{ name: 'A' }, { other: 'X' }]));
    const block = author('<div><div>[[widgets.name]] [[widgets:1.other]]</div></div>');

    repeatTemplate(block);

    expect(tokensIn(block)).to.include('widgets:1.other');
  });

  it('does not rewrite tokens for a different collection', () => {
    setMetadata('widgets', JSON.stringify([{ name: 'A' }]));
    const block = author('<div><div>[[widgets.name]] [[event-title]]</div></div>');

    repeatTemplate(block);

    expect(tokensIn(block)).to.deep.equal(['widgets:0.name', 'event-title']);
  });

  describe('bail-out paths', () => {
    it('returns false and leaves the block alone with no template row', () => {
      setMetadata('widgets', JSON.stringify([{ name: 'A' }]));
      const block = author('<div><div>Static content</div></div>');

      expect(repeatTemplate(block)).to.be.false;
      expect(block.textContent).to.include('Static content');
    });

    it('clears the template when the collection metadata is missing', () => {
      const block = author('<div><div>[[widgets.name]]</div></div>');

      expect(repeatTemplate(block)).to.be.false;
      expect(block.querySelectorAll(':scope > div')).to.have.lengthOf(0);
    });

    it('clears the template when the metadata is invalid JSON', () => {
      setMetadata('widgets', 'not json');
      const block = author('<div><div>[[widgets.name]]</div></div>');

      expect(repeatTemplate(block)).to.be.false;
      expect(tokensIn(block)).to.have.lengthOf(0);
    });

    it('clears the template when the metadata is not an array', () => {
      setMetadata('widgets', JSON.stringify({ name: 'A' }));
      const block = author('<div><div>[[widgets.name]]</div></div>');

      expect(repeatTemplate(block)).to.be.false;
      expect(tokensIn(block)).to.have.lengthOf(0);
    });

    it('clears the template when selectItems returns nothing', () => {
      setMetadata('widgets', JSON.stringify([{ name: 'A' }]));
      const block = author('<div><div>[[widgets.name]]</div></div>');

      expect(repeatTemplate(block, { selectItems: () => [] })).to.be.false;
      expect(tokensIn(block)).to.have.lengthOf(0);
    });

    it('ignores a conditional token when deriving the collection', () => {
      const block = author('<div><div>[[isFull?(Full):(Open)]]</div></div>');

      expect(repeatTemplate(block)).to.be.false;
      // No collection derived, so the authored row is left for normal decoration
      expect(tokensIn(block)).to.have.lengthOf(1);
    });
  });
});
