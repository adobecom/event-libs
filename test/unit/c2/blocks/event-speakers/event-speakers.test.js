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
    expect(el.querySelector('.speakers-title').textContent).to.equal('Speakers (2)');
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

  it('shows a working Show more toggle only when over the mobile limit (5)', async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ firstName: 'S', lastName: `${i}` }));
    setSpeakers(many);
    const el = block();
    await init(el);
    const toggle = el.querySelector('.speakers-toggle');
    expect(toggle).to.not.be.null;
    expect(el.querySelectorAll('.speaker.is-overflow')).to.have.lengthOf(2);
    toggle.click();
    expect(el.classList.contains('is-expanded')).to.be.true;
    expect(toggle.textContent).to.equal('Show less');
  });

  it('renders nothing when there are no speakers', async () => {
    setSpeakers([]);
    const el = block();
    await init(el);
    expect(el.children).to.have.lengthOf(0);
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
});
