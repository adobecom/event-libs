import { expect } from '@esm-bundle/chai';
import { hydrateBlocks } from '../../../event-libs/v1/hydrate/hydrate.js';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';

const SESSIONS = [
  {
    sessionId: '1c2f7e9a-3b4d-4e21-9a6f-6d1f1a2b3c4d',
    sessionCode: 'S6210',
    enTitle: 'Generative Fill Deep Dive',
    track: 'AI',
    url: 'https://www.adobe.com/max/2026/sessions/s6210',
    watchUrl: 'https://www.adobe.com/max/2026/live/homepage-stage',
    sessionTime: { startTimeMillis: 1784624404633, endTimeMillis: 1784628904633, timezone: 'America/Los_Angeles' },
  },
  {
    sessionId: '5f7a0b1c-5d8f-4a54-9d9c-0a5b5e6f7a8b',
    sessionCode: 'S6522',
    enTitle: 'Premiere Pro Roundtable',
    track: 'Video',
    url: 'https://www.adobe.com/max/2026/sessions/s6522',
    watchUrl: 'https://www.adobe.com/max/2026/live/session-broadcast/s6522',
    mrStreamId: 'mr-stream-s6522',
    sessionTime: { startTimeMillis: 1784624404633, endTimeMillis: 1784628904633, timezone: 'America/Los_Angeles' },
  },
  {
    sessionId: '0d646e37-b0e9-4d86-9dab-927ccb37f04e',
    sessionCode: 'OS565',
    enTitle: 'One Voice, Many Platforms',
    track: 'Creator',
    url: 'https://www.adobe.com/max/2026/sessions/os565',
    sessionTime: { startTimeMillis: 1784624404633, endTimeMillis: 1784628904633, timezone: 'America/Los_Angeles' },
  },
];

// DA percent-encodes `[[`/`]]` inside attribute values on save.
const ENCODED_CTA = encodeURIComponent('[[featured-sessions.url]]');

const AUTHORED_CONTENT = `
  <div><div>
    <p>[[featured-sessions.enTitle]]</p>
    <p>[[featured-sessions.track]]</p>
    <p><a href="${ENCODED_CTA}">Learn more</a></p>
  </div></div>
`;

const tokensIn = (el) => [...el.innerHTML.matchAll(/\[\[(.*?)\]\]/g)].map((m) => m[1]);

describe('event-card hydrator', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    setMetadata('featured-sessions', JSON.stringify(SESSIONS));
  });

  it('rewrites this card\'s authored tokens (including the percent-encoded href) to the matched session\'s index, and sets session data-attributes', async () => {
    document.body.innerHTML = `
      <div class="event-card hydrate featured-sessions s6210">
        <div><div><picture><img src="/media/s6210.jpg" alt=""></picture></div></div>
        ${AUTHORED_CONTENT}
      </div>
    `;

    await hydrateBlocks(document);

    const block = document.querySelector('.event-card');
    // Every token is now indexed to item 0 (S6210's position in the metadata array)
    expect(tokensIn(block)).to.deep.equal([
      'featured-sessions:0.enTitle',
      'featured-sessions:0.track',
      'featured-sessions:0.url',
    ]);
    expect(block.querySelector('a').getAttribute('href')).to.equal('[[featured-sessions:0.url]]');
    // The hydrator never reads/renders the values itself
    expect(block.textContent).to.not.include('Generative Fill Deep Dive');

    expect(block.dataset.sessionId).to.equal('1c2f7e9a-3b4d-4e21-9a6f-6d1f1a2b3c4d');
    expect(block.dataset.sessionUrl).to.equal('https://www.adobe.com/max/2026/sessions/s6210');
    expect(block.dataset.watchUrl).to.equal('https://www.adobe.com/max/2026/live/homepage-stage');
    expect(block.dataset.startTimeUtc).to.equal(new Date(1784624404633).toISOString());
    expect(block.dataset.endTimeUtc).to.equal(new Date(1784628904633).toISOString());
    expect(block.dataset.mrStreamId).to.be.undefined;
  });

  it('indexes tokens to the second item and sets mrStreamId when the session is broadcast-capable', async () => {
    document.body.innerHTML = `
      <div class="event-card hydrate featured-sessions s6522">
        <div><div><picture><img src="/media/s6522.jpg" alt=""></picture></div></div>
        ${AUTHORED_CONTENT}
      </div>
    `;

    await hydrateBlocks(document);

    const block = document.querySelector('.event-card');
    expect(tokensIn(block)).to.deep.equal([
      'featured-sessions:1.enTitle',
      'featured-sessions:1.track',
      'featured-sessions:1.url',
    ]);
    expect(block.querySelector('a').getAttribute('href')).to.equal('[[featured-sessions:1.url]]');
    expect(block.dataset.mrStreamId).to.equal('mr-stream-s6522');
    expect(block.dataset.watchUrl).to.equal('https://www.adobe.com/max/2026/live/session-broadcast/s6522');
  });

  it('matches a multi-letter session-code prefix (e.g. OS565), not just S####', async () => {
    document.body.innerHTML = `
      <div class="event-card hydrate featured-sessions os565">
        <div><div><picture><img src="/media/os565.jpg" alt=""></picture></div></div>
        ${AUTHORED_CONTENT}
      </div>
    `;

    await hydrateBlocks(document);

    const block = document.querySelector('.event-card');
    expect(tokensIn(block)).to.deep.equal([
      'featured-sessions:2.enTitle',
      'featured-sessions:2.track',
      'featured-sessions:2.url',
    ]);
    expect(block.dataset.sessionId).to.equal('0d646e37-b0e9-4d86-9dab-927ccb37f04e');
  });

  it('rewrites bare, prefix-less tokens (e.g. [[enTitle]]) using the card\'s own metadata key', async () => {
    document.body.innerHTML = `
      <div class="event-card hydrate featured-sessions s6210">
        <div><div><picture><img src="/media/s6210.jpg" alt=""></picture></div></div>
        <div><div>
          <p>[[enTitle]]</p>
          <p>[[track]]</p>
          <p><a href="${encodeURIComponent('[[url]]')}">Learn more</a></p>
        </div></div>
      </div>
    `;

    await hydrateBlocks(document);

    const block = document.querySelector('.event-card');
    expect(tokensIn(block)).to.deep.equal([
      'featured-sessions:0.enTitle',
      'featured-sessions:0.track',
      'featured-sessions:0.url',
    ]);
    expect(block.querySelector('a').getAttribute('href')).to.equal('[[featured-sessions:0.url]]');
    expect(block.dataset.sessionId).to.equal('1c2f7e9a-3b4d-4e21-9a6f-6d1f1a2b3c4d');
  });

  it('leaves a dotted token referencing a different metadata key untouched', async () => {
    document.body.innerHTML = `
      <div class="event-card hydrate featured-sessions s6210">
        <div><div><picture><img src="/media/s6210.jpg" alt=""></picture></div></div>
        <div><div>
          <p>[[some-other-key.title]]</p>
        </div></div>
      </div>
    `;

    await hydrateBlocks(document);

    const block = document.querySelector('.event-card');
    expect(tokensIn(block)).to.deep.equal(['some-other-key.title']);
  });

  it('leaves the authored tokens un-rewritten when the session code has no match', async () => {
    document.body.innerHTML = `
      <div class="event-card hydrate featured-sessions s9999">
        <div><div><picture><img src="/media/s9999.jpg" alt=""></picture></div></div>
        ${AUTHORED_CONTENT}
      </div>
    `;

    await hydrateBlocks(document);

    const block = document.querySelector('.event-card');
    expect(tokensIn(block)).to.deep.equal([
      'featured-sessions.enTitle',
      'featured-sessions.track',
    ]);
    expect(block.querySelector('a').getAttribute('href')).to.equal(ENCODED_CTA);
    expect(block.dataset.sessionId).to.be.undefined;
  });

  it('does nothing when there is no session-code class', async () => {
    document.body.innerHTML = `
      <div class="event-card hydrate featured-sessions">
        <div><div><picture><img src="/media/none.jpg" alt=""></picture></div></div>
        ${AUTHORED_CONTENT}
      </div>
    `;

    await hydrateBlocks(document);

    const block = document.querySelector('.event-card');
    expect(tokensIn(block)).to.deep.equal([
      'featured-sessions.enTitle',
      'featured-sessions.track',
    ]);
  });

  it('does nothing when the featured-sessions page metadata is missing', async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = `
      <div class="event-card hydrate featured-sessions s6210">
        <div><div><picture><img src="/media/s6210.jpg" alt=""></picture></div></div>
        ${AUTHORED_CONTENT}
      </div>
    `;

    await hydrateBlocks(document);

    const block = document.querySelector('.event-card');
    expect(tokensIn(block)).to.deep.equal([
      'featured-sessions.enTitle',
      'featured-sessions.track',
    ]);
    expect(block.dataset.sessionId).to.be.undefined;
  });

  it('ignores a ratio-variant class when detecting the metadata key', async () => {
    document.body.innerHTML = `
      <div class="event-card hydrate featured-sessions ratio-3-4 s6210">
        <div><div><picture><img src="/media/s6210.jpg" alt=""></picture></div></div>
        ${AUTHORED_CONTENT}
      </div>
    `;

    await hydrateBlocks(document);

    const block = document.querySelector('.event-card');
    expect(tokensIn(block)).to.deep.equal([
      'featured-sessions:0.enTitle',
      'featured-sessions:0.track',
      'featured-sessions:0.url',
    ]);
    expect(block.dataset.sessionId).to.equal('1c2f7e9a-3b4d-4e21-9a6f-6d1f1a2b3c4d');
  });

  it('leaves the authored picture untouched — images are never tokenized', async () => {
    document.body.innerHTML = `
      <div class="event-card hydrate featured-sessions s6210">
        <div><div><picture><img src="/media/s6210.jpg" alt="A hand-picked photo"></picture></div></div>
        ${AUTHORED_CONTENT}
      </div>
    `;

    await hydrateBlocks(document);

    const block = document.querySelector('.event-card');
    const img = block.querySelector('img');
    expect(img.src).to.include('/media/s6210.jpg');
    expect(img.alt).to.equal('A hand-picked photo');
  });
});
