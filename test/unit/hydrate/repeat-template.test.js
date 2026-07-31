import { expect } from '@esm-bundle/chai';

import repeatTemplate from '../../../event-libs/v1/hydrate/repeat-template.js';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';

describe('repeatTemplate', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  const author = (row, variants = '') => {
    document.body.innerHTML = `<div class="my-block hydrate${variants ? ` ${variants}` : ''}">${row}</div>`;
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

  it('indexes a token whose path contains a nested array index', () => {
    setMetadata('widgets', JSON.stringify([
      { links: [{ url: 'a' }] },
      { links: [{ url: 'b' }] },
    ]));
    const block = author('<div><div>[[widgets.links:0.url]]</div></div>');

    repeatTemplate(block);

    // The nested :0 must survive while the collection gets its own index
    expect(tokensIn(block)).to.deep.equal(['widgets:0.links:0.url', 'widgets:1.links:0.url']);
  });

  it('derives the collection from a nested-path token', () => {
    setMetadata('widgets', JSON.stringify([{ links: [{ url: 'a' }] }, { links: [{ url: 'b' }] }]));
    const block = author('<div><div>[[widgets.links:0.url]]</div></div>');

    expect(repeatTemplate(block)).to.be.true;
    expect(block.querySelectorAll(':scope > div')).to.have.lengthOf(2);
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

  // Pins the contract consumer hydrators depend on. da-bacom's selectSpeakers reads
  // block.classList to pick a type variant, so both the argument order and the second
  // argument's presence are load-bearing across the repo boundary.
  it('calls selectItems with (items, block)', () => {
    const items = [{ name: 'A' }];
    setMetadata('widgets', JSON.stringify(items));
    const block = author('<div><div>[[widgets.name]]</div></div>');
    const received = [];

    repeatTemplate(block, {
      selectItems: (...args) => {
        received.push(args);
        return args[0];
      },
    });

    expect(received).to.have.lengthOf(1);
    expect(received[0][0]).to.deep.equal(items);
    expect(received[0][1]).to.equal(block);
  });

  it('supports a selectItems that filters on the block class, as consumers do', () => {
    setMetadata('widgets', JSON.stringify([
      { name: 'A', kind: 'judge' },
      { name: 'B', kind: 'speaker' },
    ]));
    const block = author('<div><div>[[widgets.name]]</div></div>', 'speaker');

    repeatTemplate(block, {
      selectItems: (items, el) => items.filter((i) => el.classList.contains(i.kind)),
    });

    expect(tokensIn(block)).to.deep.equal(['widgets:1.name']);
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

  it('does not corrupt a collection whose name starts with the template collection', () => {
    setMetadata('widgets', JSON.stringify([{ name: 'A' }]));
    setMetadata('widgetsExtra', JSON.stringify([{ name: 'Z' }]));
    const block = author('<div><div>[[widgets.name]] [[widgetsExtra.name]]</div></div>');

    repeatTemplate(block);

    // Not `widgets:0Extra.name`
    expect(tokensIn(block)).to.deep.equal(['widgets:0.name', 'widgetsExtra.name']);
  });

  it('rewrites an alt-attribute token exactly once', () => {
    setMetadata('widgets', JSON.stringify([{ photo: {} }]));
    const block = author('<div><div><img alt="[[widgets.photo]]"></div></div>');

    repeatTemplate(block);

    expect(block.querySelector('img').alt).to.equal('[[widgets:0.photo]]');
  });

  describe('authoring mistakes', () => {
    let lanaLogs;
    let originalLog;

    beforeEach(() => {
      lanaLogs = [];
      originalLog = window.lana?.log;
      window.lana = { ...window.lana, log: (msg) => lanaLogs.push(msg) };
    });

    afterEach(() => {
      if (originalLog) window.lana.log = originalLog;
    });

    it('warns when more than one row carries tokens', () => {
      setMetadata('widgets', JSON.stringify([{ name: 'A' }, { name: 'B' }]));
      const block = author(`
        <div><div>[[widgets.name]]</div></div>
        <div><div>[[widgets.other]]</div></div>
      `);

      repeatTemplate(block);

      expect(lanaLogs.some((m) => m.includes('only the first is used as the template'))).to.be.true;
      expect(block.querySelectorAll(':scope > div')).to.have.lengthOf(2);
    });

    it('warns and reports failure when selectItems returns copies, not originals', () => {
      setMetadata('widgets', JSON.stringify([{ name: 'A' }, { name: 'B' }]));
      const block = author('<div><div>[[widgets.name]]</div></div>');

      // Nothing rendered, so this must not report success — otherwise the block gets
      // marked hydrated and never retried.
      expect(repeatTemplate(block, {
        selectItems: (items) => items.map((i) => ({ ...i })),
      })).to.be.false;
      expect(lanaLogs.some((m) => m.includes('return the original objects'))).to.be.true;
      expect(block.querySelectorAll(':scope > div')).to.have.lengthOf(0);
    });

    it('does not repeat a row whose only token carries an explicit index', () => {
      setMetadata('widgets', JSON.stringify([{ name: 'A' }, { name: 'B' }]));
      const block = author('<div><div>[[widgets:0.name]]</div></div>');

      // An indexed token names one item, not a collection, so there is nothing to repeat.
      expect(repeatTemplate(block)).to.be.false;
      expect(lanaLogs.some((m) => m.includes('no metadata array matches'))).to.be.true;
    });

    it('derives the collection regardless of where its token sits in the row', () => {
      setMetadata('event-title', 'My Event');
      setMetadata('widgets', JSON.stringify([{ name: 'A' }, { name: 'B' }]));
      // A page-level placeholder first would previously be mistaken for the collection
      const block = author('<div><div>[[event-title]]</div><div>[[widgets.name]]</div></div>');

      expect(repeatTemplate(block)).to.be.true;
      expect(tokensIn(block)).to.deep.equal([
        'event-title', 'widgets:0.name', 'event-title', 'widgets:1.name',
      ]);
    });

    it('warns that a per-item conditional is unsupported, and leaves it unindexed', () => {
      setMetadata('widgets', JSON.stringify([{ name: 'A', vip: true }, { name: 'B' }]));
      const block = author('<div><div>[[widgets.name]] [[widgets.vip?(VIP):()]]</div></div>');

      repeatTemplate(block);

      // Indexing it would be worse: CONDITIONAL_REG would read the condition as `0.vip`
      expect(lanaLogs.some((m) => m.includes('per-item conditionals are not supported'))).to.be.true;
      expect(tokensIn(block)).to.deep.equal([
        'widgets:0.name', 'widgets.vip?(VIP):()',
        'widgets:1.name', 'widgets.vip?(VIP):()',
      ]);
    });

    it('reports a misspelled collection name', () => {
      setMetadata('widgets', JSON.stringify([{ name: 'A' }]));
      const block = author('<div><div>[[widgts.name]]</div></div>');

      expect(repeatTemplate(block)).to.be.false;
      expect(lanaLogs.some((m) => m.includes('spelled correctly'))).to.be.true;
      expect(tokensIn(block)).to.have.lengthOf(0);
    });
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

    it('does not treat a conditional token as a collection', () => {
      const block = author('<div><div>[[isFull?(Full):(Open)]]</div></div>');

      expect(repeatTemplate(block)).to.be.false;
    });

    it('does not treat an @array helper as a collection', () => {
      setMetadata('widgets', JSON.stringify([{ name: 'A' }]));
      const block = author('<div><div>[[@array(widgets.name),]]</div></div>');

      expect(repeatTemplate(block)).to.be.false;
    });
  });
});
