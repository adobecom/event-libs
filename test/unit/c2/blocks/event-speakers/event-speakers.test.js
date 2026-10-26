import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import init from '../../../../../event-libs/v1/c2/blocks/event-speakers/event-speakers.js';

function setSpeakers(list) {
  setMetadata('speakers', JSON.stringify(list));
}

function block() {
  const el = document.createElement('div');
  el.className = 'speakers';
  return el;
}

function backgroundRow(value) {
  const row = document.createElement('div');
  const key = document.createElement('div');
  key.textContent = 'Background';
  const val = document.createElement('div');
  val.textContent = value;
  row.append(key, val);
  return row;
}

// GS1 (Opening Keynote) metadata as deployed today: ascending speakerId.
const GS1 = [
  ['364ea287-e809-4566-8400-c7e83859c9b2', 'Shantanu', 'Narayen', 'Speaker', 1],
  ['3d857617-fe36-427d-a27d-b632a4a90f9e', 'Kelly', 'Weldon', 'Presenter', 3],
  ['57b02520-38f8-44c1-be63-272325b4bf1e', 'Veronica', 'Peitong Chen', 'Presenter', 5],
  ['695ea5ff-d1c5-4206-a2fd-0c38ca030f7d', 'Elise', 'Swopes', 'Presenter', 2],
  ['698544f0-44d1-4af4-b894-3ffbca7bc76d', 'Forest', 'Key', 'Presenter', 9],
  ['731f5245-171d-4569-b07f-f7c22a97ba5f', 'Paul', 'Trani', 'Presenter', 4],
  ['803dff5b-dd89-477f-b41b-652455417b90', 'Michael', 'Fugoso', 'Presenter', 6],
  ['812777ae-407a-40cb-9361-3c72ca793e0f', 'Anil', 'Chakravarthy', 'Speaker', 2],
  ['8b77192a-24f4-4890-866d-71c097e72a31', 'Lucy', 'Street', 'Presenter', 8],
  ['9f3e7822-48f6-4dd4-931b-ddf26aeaba6b', 'Anna', 'McNaught', 'Presenter', 1],
  ['bdfa2e45-0c4e-4060-8a51-b2948fdad4e5', 'Deepa', 'Subramaniam', 'Presenter', 10],
  ['ef1e7f75-813e-4dcc-a8d7-f906758e7c76', 'Dacia', 'Sáenz', 'Presenter', 7],
].map(([speakerId, firstName, lastName, speakerType, ordinal]) => ({
  speakerId,
  firstName,
  lastName,
  speakerType,
  ordinal,
}));

const renderedNames = (el, selector = '.speaker-name') => [...el.querySelectorAll(selector)]
  .map((node) => node.textContent);

describe('Speakers', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('renders a title with the speaker count and a row per speaker', async () => {
    setSpeakers([
      { firstName: 'Shantanu', lastName: 'Narayen', title: 'Chair and CEO', company: 'Adobe', photo: { imageUrl: 'https://x/a.jpg', altText: 'Shantanu' } },
      { firstName: 'Danielle', lastName: 'Morimoto', title: 'Group Design Manager', company: 'Adobe' },
    ]);
    const el = block();
    await init(el);
    expect(el.querySelector('.speakers-title').textContent).to.equal('Speakers');
    const rows = [...el.querySelectorAll('.speaker')];
    expect(rows).to.have.lengthOf(2);
    expect(rows[0].querySelector('.speaker-name').textContent).to.equal('Shantanu Narayen');
    expect(rows[0].querySelector('.speaker-role').textContent).to.equal('Chair and CEO, Adobe');
  });

  it('uses the nested photo.imageUrl + altText for the avatar', async () => {
    setSpeakers([{ firstName: 'Shantanu', lastName: 'Narayen', photo: { imageUrl: 'https://x/a.jpg', altText: 'headshot' } }]);
    const el = block();
    await init(el);
    const img = el.querySelector('.speaker-photo');
    expect(img.getAttribute('src')).to.equal('https://x/a.jpg');
    expect(img.getAttribute('alt')).to.equal('headshot');
  });

  it('supports a flat photoURL', async () => {
    setSpeakers([{ firstName: 'Ada', lastName: 'Lovelace', photoURL: 'https://x/b.jpg' }]);
    const el = block();
    await init(el);
    expect(el.querySelector('.speaker-photo').getAttribute('src')).to.equal('https://x/b.jpg');
  });

  it('falls back to initials when a speaker has no photo', async () => {
    setSpeakers([{ firstName: 'Cari', lastName: 'Tester', title: 'Test', company: 'Test' }]);
    const el = block();
    await init(el);
    const avatar = el.querySelector('.speaker-avatar');
    expect(avatar.classList.contains('speaker-avatar--placeholder')).to.be.true;
    expect(avatar.textContent).to.equal('CT');
    expect(avatar.querySelector('img')).to.be.null;
  });

  it('shows a working Show more toggle only when over the visible limit (5)', async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ firstName: 'S', lastName: `${i}` }));
    setSpeakers(many);
    const el = block();
    await init(el);
    const toggle = el.querySelector('.speakers-toggle');
    expect(toggle).to.not.be.null;
    expect(el.querySelectorAll('.speaker.is-overflow')).to.have.lengthOf(2);
    expect(toggle.getAttribute('daa-ll')).to.equal('Show-More-Speakers');
    toggle.click();
    expect(el.classList.contains('is-expanded')).to.be.true;
    expect(toggle.textContent).to.equal('Show less');
    expect(toggle.getAttribute('daa-ll')).to.equal('Show-Less-Speakers');
    toggle.click();
    expect(el.classList.contains('is-expanded')).to.be.false;
    expect(toggle.textContent).to.equal('Show more');
    expect(toggle.getAttribute('daa-ll')).to.equal('Show-More-Speakers');
  });

  it('omits the count at the visible limit and shows it just above', async () => {
    const atLimit = Array.from({ length: 5 }, (_, i) => ({ firstName: 'S', lastName: `${i}` }));
    let el = block();
    setSpeakers(atLimit);
    await init(el);
    expect(el.querySelector('.speakers-title').textContent).to.equal('Speakers');
    expect(el.querySelector('.speakers-count')).to.be.null;

    const overLimit = Array.from({ length: 6 }, (_, i) => ({ firstName: 'S', lastName: `${i}` }));
    el = block();
    setSpeakers(overLimit);
    await init(el);
    expect(el.querySelector('.speakers-count').textContent).to.equal(' (6)');
  });

  it('renders an empty state when there are no speakers', async () => {
    setSpeakers([]);
    const el = block();
    await init(el);
    expect(el.querySelector('.speakers-title').textContent).to.equal('Speakers');
    expect(el.querySelector('.speakers-empty').textContent).to.equal('No speakers available for this session');
    expect(el.children).to.have.lengthOf(2);
  });

  it('applies an authored Background row as the block background', async () => {
    setSpeakers([{ firstName: 'Ada', lastName: 'Lovelace' }]);
    const el = block();
    el.append(backgroundRow('#ff0000'));
    await init(el);
    expect(el.style.background).to.equal('rgb(255, 0, 0)');
  });

  it('leaves the background unset when no Background row is authored', async () => {
    setSpeakers([{ firstName: 'Ada', lastName: 'Lovelace' }]);
    const el = block();
    await init(el);
    expect(el.style.background).to.equal('');
  });

  // MWPW-212902: RainFocus lists the Speakers first, then the Co-Presenters ('Presenter'),
  // each by its own ordinal, so Anil is no longer hidden behind Show more.
  it('orders GS1 by role, then ordinal, with both Speakers above the fold', async () => {
    setSpeakers(GS1);
    const el = block();
    await init(el);
    expect(renderedNames(el)).to.deep.equal([
      'Shantanu Narayen', 'Anil Chakravarthy', 'Anna McNaught', 'Elise Swopes', 'Kelly Weldon',
      'Paul Trani', 'Veronica Peitong Chen', 'Michael Fugoso', 'Dacia Sáenz', 'Lucy Street',
      'Forest Key', 'Deepa Subramaniam',
    ]);
    expect(renderedNames(el, '.speaker:not(.is-overflow) .speaker-name')).to.deep.equal([
      'Shantanu Narayen', 'Anil Chakravarthy', 'Anna McNaught', 'Elise Swopes', 'Kelly Weldon',
    ]);
    expect(el.querySelector('.speakers-count').textContent).to.equal(' (12)');
  });

  it('orders S6331 by ordinal within the Speaker role', async () => {
    setSpeakers([
      { firstName: 'Nathan', lastName: 'Goldman', speakerType: 'Speaker', ordinal: 2 },
      { firstName: 'Dan', lastName: 'Kuhlken', speakerType: 'Speaker', ordinal: 1 },
    ]);
    const el = block();
    await init(el);
    expect(renderedNames(el)).to.deep.equal(['Dan Kuhlken', 'Nathan Goldman']);
  });

  it('labels the fallback diagnostic with the page session code', async () => {
    setMetadata('session-code', 'S1234');
    setSpeakers([
      { firstName: 'Mo', lastName: 'Derator', speakerType: 'Host', ordinal: 1 },
      { firstName: 'Ada', lastName: 'Lovelace', speakerType: 'Speaker', ordinal: 1 },
    ]);
    const logged = [];
    const originalLana = window.lana;
    window.lana = { log: (msg) => logged.push(msg) };
    const el = block();
    try {
      await init(el);
    } finally {
      window.lana = originalLana;
    }
    expect(renderedNames(el)).to.deep.equal(['Ada Lovelace', 'Mo Derator']);
    expect(logged).to.have.lengthOf(1);
    expect(logged[0]).to.include('[session-speakers] S1234: 1 of 2 speaker(s)');
  });
});
