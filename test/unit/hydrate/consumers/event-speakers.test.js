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
    bio: 'Elise Swopes is a self taught photographer and graphic designer known for unique cityscapes.',
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
 * Verbatim copy of da-bacom/blocks/event-speakers/event-speakers.js so the
 * integration test can prove the hydrated DOM survives the real block's init.
 * Keep in sync with that file.
 */
const PREVIEW_LENGTH = 75;
const READ_MORE = 'Read more';

const initEventSpeakersBlock = (el) => {
  const rows = el?.querySelectorAll(':scope > div');

  rows?.forEach((row) => {
    row?.classList.add('speaker');

    const columns = row?.querySelectorAll(':scope > div');
    const name = columns?.[1];
    const desc = columns?.[2];
    const descHtml = desc?.innerHTML;
    const readMore = columns?.[3];
    const readMoreText = readMore?.innerText || READ_MORE;

    name?.classList.add('name');
    name?.querySelector('h1, h2, h3, h4, h5, h6')?.classList.add('body-s');
    desc?.classList.add('desc');
    readMore?.remove();

    if (descHtml?.length > PREVIEW_LENGTH) {
      const preview = descHtml.slice(0, PREVIEW_LENGTH);
      const button = document.createElement('button');

      button.innerText = readMoreText;
      button.addEventListener('click', (event) => {
        event.target.parentElement.innerHTML = descHtml;
      });
      desc.innerHTML = `${preview}<span class="ellipsis">...</span>`;
      desc.appendChild(button);
    }

    const section = document.createElement('section');

    section.classList.add('text', 'body-xs');
    name.parentNode.insertBefore(section, name);
    section.append(name, desc);
  });
};

describe('event-speakers hydrator', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  const authorBlock = (variants = '') => {
    document.body.innerHTML = `
      <div class="event-speakers hydrate${variants ? ` ${variants}` : ''}">
        <div><div></div></div>
      </div>
    `;
    return document.querySelector('.event-speakers');
  };

  describe('block contract', () => {
    it('produces exactly four cells per row in the documented order', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      const rows = block.querySelectorAll(':scope > div');
      expect(rows).to.have.lengthOf(2);

      rows.forEach((row) => {
        const cells = row.querySelectorAll(':scope > div');
        expect(cells).to.have.lengthOf(4);
        // cell 1 must be non-empty or the block throws on name.parentNode
        expect(cells[1].textContent.trim()).to.not.equal('');
        expect(cells[0].querySelector('picture > img')).to.not.be.null;
        expect(cells[2].querySelector('p')).to.not.be.null;
        expect(cells[3].textContent).to.equal('Read more');
      });
    });

    it('removes authored placeholder rows', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      document.body.innerHTML = `
        <div class="event-speakers hydrate speaker">
          <div><div>placeholder</div></div>
          <div><div>another placeholder</div></div>
        </div>
      `;
      const block = document.querySelector('.event-speakers');

      hydrateEventSpeakers(block);

      expect(block.textContent).to.not.include('placeholder');
      expect(block.querySelectorAll(':scope > div')).to.have.lengthOf(2);
    });

    it('renders the name as a heading the block can style', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      const heading = block.querySelector(':scope > div > div:nth-child(2) > h3');
      expect(heading).to.not.be.null;
      expect(heading.textContent).to.equal('Elise Swopes');
    });
  });

  describe('data handling', () => {
    it('filters speakers by variant class', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      const block = authorBlock('judge');

      hydrateEventSpeakers(block);

      const rows = block.querySelectorAll(':scope > div');
      expect(rows).to.have.lengthOf(1);
      expect(rows[0].textContent).to.include('Sam Rivera');
    });

    it('renders every speaker when no type variant is present', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      const block = authorBlock();

      hydrateEventSpeakers(block);

      expect(block.querySelectorAll(':scope > div')).to.have.lengthOf(3);
    });

    it('sorts speakers by ordinal', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      const names = [...block.querySelectorAll('h3')].map((h) => h.textContent);
      expect(names).to.deep.equal(['Elise Swopes', 'Katie Johnson']);
    });

    it('includes company only when present', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      const [elise, katie] = block.querySelectorAll(':scope > div');
      const eliseParas = [...elise.querySelectorAll(':scope > div:nth-child(2) > p')];
      const katieParas = [...katie.querySelectorAll(':scope > div:nth-child(2) > p')];

      expect(eliseParas.map((p) => p.textContent)).to.deep.equal([
        'Sr. Community Relationship Manager and Evangelist',
        'Adobe',
      ]);
      expect(katieParas.map((p) => p.textContent)).to.deep.equal(['Co-Owner, goodtype']);
    });

    it('reads title and bio from localizations when not top level', () => {
      setMetadata('speakers', JSON.stringify([{
        speakerId: 'spk-loc',
        ordinal: 0,
        speakerType: 'Speaker',
        firstName: 'Yuko',
        lastName: 'Shimizu',
        localizations: { 'en-US': { title: 'Illustrator and Educator', bio: 'Localized bio.' } },
        photo: { imageUrl: 'https://example.com/yuko.jpg' },
      }]));
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      const row = block.querySelector(':scope > div');
      expect(row.querySelector(':scope > div:nth-child(2) > p').textContent).to.equal('Illustrator and Educator');
      expect(row.querySelector(':scope > div:nth-child(3) > p').textContent).to.equal('Localized bio.');
    });

    it('tolerates type as an alias for speakerType', () => {
      setMetadata('speakers', JSON.stringify([{
        ordinal: 0,
        type: 'Host',
        firstName: 'Alex',
        lastName: 'Chen',
        bio: 'Hosting.',
        photo: { imageUrl: 'https://example.com/alex.jpg' },
      }]));
      const block = authorBlock('host');

      hydrateEventSpeakers(block);

      expect(block.querySelector('h3').textContent).to.equal('Alex Chen');
    });

    it('falls back to the full name for alt text when photo has none', () => {
      setMetadata('speakers', JSON.stringify([{
        ordinal: 0,
        speakerType: 'Speaker',
        firstName: 'No',
        lastName: 'Alt',
        bio: 'Bio.',
        photo: { imageUrl: 'https://example.com/noalt.jpg' },
      }]));
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      expect(block.querySelector('img').alt).to.equal('No Alt');
    });

    it('still renders a row when a speaker has no photo', () => {
      setMetadata('speakers', JSON.stringify([{
        ordinal: 0,
        speakerType: 'Speaker',
        firstName: 'Photoless',
        lastName: 'Person',
        bio: 'Bio.',
      }]));
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      const cells = block.querySelectorAll(':scope > div > div');
      expect(cells).to.have.lengthOf(4);
      expect(block.querySelector('img')).to.be.null;
      expect(cells[1].textContent).to.include('Photoless Person');
    });

    it('renders name and title as text, not markup', () => {
      setMetadata('speakers', JSON.stringify([{
        ordinal: 0,
        speakerType: 'Speaker',
        firstName: '<img src=x onerror="window.__xss=1">',
        lastName: 'Tag',
        title: '<script>window.__xss=1</script>CEO',
        bio: 'Bio.',
      }]));
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      const nameCell = block.querySelector(':scope > div > div:nth-child(2)');
      expect(nameCell.querySelector('img')).to.be.null;
      expect(nameCell.querySelector('script')).to.be.null;
      expect(nameCell.querySelector('h3').textContent).to.include('<img');
    });

    it('does not pre-truncate the bio', () => {
      const longBio = 'A'.repeat(400);
      setMetadata('speakers', JSON.stringify([{
        ordinal: 0,
        speakerType: 'Speaker',
        firstName: 'Long',
        lastName: 'Bio',
        bio: longBio,
        photo: { imageUrl: 'https://example.com/long.jpg' },
      }]));
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      expect(block.querySelector(':scope > div > div:nth-child(3) > p').textContent).to.equal(longBio);
    });
  });

  // A surviving placeholder row is worse than an empty block: the block throws on
  // `name.parentNode` for a row with fewer than two cells, but tolerates no rows.
  describe('graceful degradation', () => {
    const expectSafelyEmpty = (block) => {
      expect(block.querySelectorAll(':scope > div')).to.have.lengthOf(0);
      expect(document.querySelector('.event-speakers')).to.not.be.null;
      expect(() => initEventSpeakersBlock(block)).to.not.throw();
    };

    it('clears placeholder rows when no speakers metadata exists', () => {
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      expectSafelyEmpty(block);
    });

    it('clears placeholder rows when metadata is invalid JSON', () => {
      setMetadata('speakers', 'not json');
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      expectSafelyEmpty(block);
    });

    it('clears placeholder rows when no speaker matches the variant', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      const block = authorBlock('keynote');

      hydrateEventSpeakers(block);

      expectSafelyEmpty(block);
    });

    it('clears placeholder rows for an empty speakers array', () => {
      setMetadata('speakers', JSON.stringify([]));
      const block = authorBlock('speaker');

      hydrateEventSpeakers(block);

      expectSafelyEmpty(block);
    });
  });

  describe('integration with the consumer block', () => {
    it('is resolved by hydrateBlocks via the built-in hydrator map', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      authorBlock('speaker');

      hydrateBlocks(document);

      const block = document.querySelector('.event-speakers');
      expect(block.querySelectorAll('img')).to.have.lengthOf(2);
    });

    it('survives the real block init and produces its expected DOM', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      authorBlock('speaker');

      hydrateBlocks(document);
      const block = document.querySelector('.event-speakers');

      // Must not throw — a row missing its name cell would abort here
      initEventSpeakersBlock(block);

      const speakers = block.querySelectorAll('.speaker');
      expect(speakers).to.have.lengthOf(2);

      speakers.forEach((speaker) => {
        expect(speaker.querySelector(':scope > div > picture > img')).to.not.be.null;
        expect(speaker.querySelector(':scope > section.text')).to.not.be.null;
        expect(speaker.querySelector(':scope > section > div.name')).to.not.be.null;
        expect(speaker.querySelector(':scope > section > div.name > h3.body-s')).to.not.be.null;
        expect(speaker.querySelector(':scope > section > div.desc')).to.not.be.null;
      });
    });

    it('yields a working read more expansion after init', () => {
      setMetadata('speakers', JSON.stringify(SPEAKERS));
      authorBlock('speaker');

      hydrateBlocks(document);
      const block = document.querySelector('.event-speakers');
      initEventSpeakersBlock(block);

      const desc = block.querySelector('.desc');
      const button = desc.querySelector('button');
      expect(button).to.not.be.null;
      expect(button.innerText).to.equal('Read more');
      expect(desc.querySelector('.ellipsis')).to.not.be.null;

      button.click();

      expect(desc.querySelector('.ellipsis')).to.be.null;
      expect(desc.textContent).to.include('unique cityscapes');
    });
  });
});
