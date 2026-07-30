import { expect } from '@esm-bundle/chai';

import hydrateEventSpeakers from '../../../../event-libs/v1/hydrate/consumers/event-speakers.js';
import { hydrateBlocks } from '../../../../event-libs/v1/hydrate/hydrate.js';
import { setMetadata } from '../../../../event-libs/v1/utils/utils.js';

const SPEAKERS = [
  {
    speakerId: 'spk-2',
    ordinal: 1,
    speakerType: 'Speaker',
    firstName: 'Katie',
    lastName: 'Johnson',
    title: 'Co-Owner, goodtype',
    bio: 'Katie Johnson is a queso-loving lettering artist who lives in Austin, Texas.',
    photo: { imageUrl: 'https://example.com/katie.jpg', altText: 'Speaker photo for: Katie Johnson' },
  },
  {
    speakerId: 'spk-1',
    ordinal: 0,
    speakerType: 'Speaker',
    firstName: 'Elise',
    lastName: 'Swopes',
    title: 'Sr. Community Relationship Manager and Evangelist',
    company: 'Adobe',
    bio: 'Elise Swopes is a self taught photographer and graphic designer.',
    photo: { imageUrl: 'https://example.com/elise.jpg', altText: 'Speaker photo for: Elise Swopes' },
  },
  {
    speakerId: 'jdg-1',
    ordinal: 0,
    speakerType: 'Judge',
    firstName: 'Sam',
    lastName: 'Rivera',
    title: 'Creative Director',
    bio: 'Sam judges things.',
    photo: { imageUrl: 'https://example.com/sam.jpg', altText: 'Speaker photo for: Sam Rivera' },
  },
];

/**
 * The authored template row. Everything the block renders — including the "Read more"
 * label — comes from here, never from hydrator code.
 */
const TEMPLATE_ROW = `
  <div>
    <div><picture><img src="./media_1.jpg?width=750" alt="[[speakers.photo]]"></picture></div>
    <div><h3>[[speakers.firstName]] [[speakers.lastName]]</h3><p>[[speakers.title]]</p></div>
    <div><p>[[speakers.bio]]</p></div>
    <div>Read more</div>
  </div>
`;

describe('event-speakers hydrator', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  const authorBlock = (variants = '', row = TEMPLATE_ROW) => {
    document.body.innerHTML = `
      <div class="event-speakers hydrate${variants ? ` ${variants}` : ''}">${row}</div>
    `;
    return document.querySelector('.event-speakers');
  };

  const tokensIn = (block) => [...block.innerHTML.matchAll(/\[\[(.*?)\]\]/g)].map((m) => m[1]);

  describe('template repetition', () => {
    it('clones the authored row once per speaker', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      const rows = block.querySelectorAll(':scope > div');
      expect(rows).to.have.lengthOf(2);
      rows.forEach((row) => {
        expect(row.querySelectorAll(':scope > div')).to.have.lengthOf(4);
      });
    });

    it('removes the template row so it cannot render raw tokens', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      expect(tokensIn(block).every((t) => t.includes(':'))).to.be.true;
    });

    it('indexes each clone to its speaker, ordinal order', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      const [first, second] = block.querySelectorAll(':scope > div');
      // Elise has ordinal 0 but is index 1 in the metadata; Katie is ordinal 1, index 0
      expect(first.innerHTML).to.include('[[speakers:1.firstName]]');
      expect(second.innerHTML).to.include('[[speakers:0.firstName]]');
    });

    it('rewrites image tokens in the alt attribute', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      const alts = [...block.querySelectorAll('img')].map((img) => img.alt);
      expect(alts).to.deep.equal(['[[speakers:1.photo]]', '[[speakers:0.photo]]']);
    });

    it('preserves authored content that is not a token', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      const labels = [...block.querySelectorAll(':scope > div > div:nth-child(4)')]
        .map((cell) => cell.textContent.trim());
      expect(labels).to.deep.equal(['Read more', 'Read more']);
    });

    it('honours a different authored read-more label', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      const block = authorBlock('speaker', TEMPLATE_ROW.replace('Read more', 'Open me'));

      hydrateEventSpeakers(block);

      expect(block.querySelector(':scope > div > div:nth-child(4)').textContent.trim()).to.equal('Open me');
    });

    it('preserves the authored picture markup for the image pipeline', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      const picture = block.querySelector('picture');
      expect(picture).to.not.be.null;
      expect(picture.querySelector('img').getAttribute('src')).to.equal('./media_1.jpg?width=750');
    });
  });

  describe('selection', () => {
    it('filters speakers by variant class', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      const block = authorBlock('judge');

      hydrateEventSpeakers(block);

      const rows = block.querySelectorAll(':scope > div');
      expect(rows).to.have.lengthOf(1);
      expect(rows[0].innerHTML).to.include('[[speakers:2.firstName]]');
    });

    it('renders every speaker when no type variant is present', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      const block = authorBlock();

      hydrateEventSpeakers(block);

      expect(block.querySelectorAll(':scope > div')).to.have.lengthOf(3);
    });

    it('tolerates type as an alias for speakerType', () => {
      setMetadata('speakers', JSON.stringify([
        { ordinal: 0, type: 'Host', firstName: 'Alex', lastName: 'Chen' },
      ]));
      const block = authorBlock('host');

      hydrateEventSpeakers(block);

      expect(block.querySelectorAll(':scope > div')).to.have.lengthOf(1);
    });

    it('places speakers without an ordinal after those with one', () => {
      setMetadata('speakers', JSON.stringify([
        { speakerType: 'Speaker', firstName: 'No', lastName: 'Ordinal' },
        { ordinal: 5, speakerType: 'Speaker', firstName: 'Five', lastName: 'X' },
      ]));
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      const [first, second] = block.querySelectorAll(':scope > div');
      expect(first.innerHTML).to.include('[[speakers:1.firstName]]');
      expect(second.innerHTML).to.include('[[speakers:0.firstName]]');
    });
  });

  // A surviving template row would render literal [[tokens]] to the user, and a row with
  // fewer than two cells makes the block throw on `name.parentNode`.
  describe('graceful degradation', () => {
    const expectSafelyEmpty = (block) => {
      expect(block.querySelectorAll(':scope > div')).to.have.lengthOf(0);
      expect(tokensIn(block)).to.have.lengthOf(0);
      expect(document.querySelector('.event-speakers')).to.not.be.null;
    };

    it('clears the template when no speakers metadata exists', () => {
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      expectSafelyEmpty(block);
    });

    it('clears the template when metadata is invalid JSON', () => {
      setMetadata('speakers', 'not json');
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      expectSafelyEmpty(block);
    });

    it('clears the template when no speaker matches the variant', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      const block = authorBlock('keynote');

      hydrateEventSpeakers(block);

      expectSafelyEmpty(block);
    });

    it('clears the template for an empty speakers array', () => {
      setMetadata('speakers', JSON.stringify([]));
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      expectSafelyEmpty(block);
    });

    it('leaves an un-templated block alone', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      const block = authorBlock('speaker', '<div><div>Static</div><div>Author content</div></div>');

      hydrateEventSpeakers(block);

      expect(block.querySelectorAll(':scope > div')).to.have.lengthOf(1);
      expect(block.textContent).to.include('Static');
    });
  });

  describe('integration', () => {
    it('is dispatched by hydrateBlocks', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      authorBlock('speaker');

      hydrateBlocks(document);

      const block = document.querySelector('.event-speakers');
      expect(block.querySelectorAll(':scope > div')).to.have.lengthOf(2);
      expect(block.getAttribute('data-hydrated')).to.equal('true');
    });
  });
});
