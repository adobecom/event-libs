import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import init from '../../../../../event-libs/v1/c2/blocks/event-session-details/event-session-details.js';

function block() {
  const el = document.createElement('div');
  el.className = 'session-details';
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

describe('Session Details', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('renders the session title from metadata', async () => {
    setMetadata('title', 'My Session');
    const el = block();
    await init(el);
    expect(el.querySelector('.session-title').textContent).to.equal('My Session');
  });

  it('applies an authored Background row as the block background and removes the row', async () => {
    setMetadata('title', 'My Session');
    const el = block();
    el.append(backgroundRow('#ff0000'));
    await init(el);
    expect(el.style.background).to.equal('rgb(255, 0, 0)');
    expect(el.querySelector('.session-title')).to.not.be.null;
  });

  it('leaves the background unset when no Background row is authored', async () => {
    setMetadata('title', 'My Session');
    const el = block();
    await init(el);
    expect(el.style.background).to.equal('');
  });
});
