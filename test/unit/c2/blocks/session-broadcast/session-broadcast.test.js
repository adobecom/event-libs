import { expect } from '@esm-bundle/chai';
import init, { parseBroadcastConfig } from '../../../../../event-libs/v1/c2/blocks/session-broadcast/session-broadcast.js';
import { sessionsStatus } from '../../../../../event-libs/v1/utils/session-store.js';

// "Session ended image" supports two authoring styles (see extractSessionEndedImageUrl's
// comment): a link to the image asset, or an embedded picture. The fixture builds a real
// anchor for that row by default; embedded-picture authoring gets its own test below.
function block(rows) {
  const el = document.createElement('div');
  el.className = 'session-broadcast';
  rows.forEach(([key, value]) => {
    const row = document.createElement('div');
    const k = document.createElement('div');
    k.textContent = key;
    const v = document.createElement('div');
    if (key === 'Session ended image') {
      const a = document.createElement('a');
      a.href = value;
      a.textContent = 'image';
      v.append(a);
    } else {
      v.textContent = value;
    }
    row.append(k, v);
    el.append(row);
  });
  return el;
}

describe('parseBroadcastConfig', () => {
  it('falls back to defaults when no rows are authored', () => {
    const config = parseBroadcastConfig(block([]));
    expect(config).to.deep.equal({
      alsoLiveTitle: 'Currently Live',
      upcomingTitle: 'Upcoming',
      viewAllDetailsLabel: 'View all details',
      sessionEndedImageUrl: '',
    });
  });

  it('picks up all four authored rows', () => {
    const config = parseBroadcastConfig(block([
      ['Also live title', 'Live Now'],
      ['Upcoming title', 'Coming Up'],
      ['View all details label', 'See more'],
      ['Session ended image', 'https://example.com/ended.png'],
    ]));
    expect(config.alsoLiveTitle).to.equal('Live Now');
    expect(config.upcomingTitle).to.equal('Coming Up');
    expect(config.viewAllDetailsLabel).to.equal('See more');
    expect(config.sessionEndedImageUrl).to.include('ended.png');
  });

  it('falls back to the default for any row left unauthored, independently of the others', () => {
    const config = parseBroadcastConfig(block([['Also live title', 'Live Now']]));
    expect(config.alsoLiveTitle).to.equal('Live Now');
    expect(config.upcomingTitle).to.equal('Upcoming');
  });

  it('also accepts "Session ended image" authored as an embedded picture, not just a link', () => {
    const el = block([]);
    const row = document.createElement('div');
    const label = document.createElement('div');
    label.textContent = 'Session ended image';
    const value = document.createElement('div');
    const picture = document.createElement('picture');
    const img = document.createElement('img');
    img.src = 'https://example.com/ended.png';
    picture.append(img);
    value.append(picture);
    row.append(label, value);
    el.append(row);

    expect(parseBroadcastConfig(el).sessionEndedImageUrl).to.equal('https://example.com/ended.png');
  });
});

describe('session-broadcast init()', () => {
  beforeEach(() => {
    sessionsStatus.value = 'idle';
  });

  it('marks the block element and replaces authored config rows with the rendered app', async () => {
    const el = block([['Also live title', 'Currently Live']]);
    await init(el);
    expect(el.classList.contains('session-broadcast')).to.be.true;
    expect(el.innerHTML).to.include('sb-app');
    expect(el.innerHTML).to.not.include('Also live title');
  });
});
