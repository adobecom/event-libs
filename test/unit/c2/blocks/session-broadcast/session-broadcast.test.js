import { expect } from '@esm-bundle/chai';
import init, { parseBroadcastConfig } from '../../../../../event-libs/v1/c2/blocks/session-broadcast/session-broadcast.js';
import { sessionsStatus } from '../../../../../event-libs/v1/utils/session-store.js';

function block(rows) {
  const el = document.createElement('div');
  el.className = 'session-broadcast';
  rows.forEach(([key, value]) => {
    const row = document.createElement('div');
    const k = document.createElement('div');
    k.textContent = key;
    const v = document.createElement('div');
    v.textContent = value;
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
      sessionEndedImageHtml: '',
    });
  });

  it('picks up all four authored rows', () => {
    const config = parseBroadcastConfig(block([
      ['Also live title', 'Live Now'],
      ['Upcoming title', 'Coming Up'],
      ['View all details label', 'See more'],
      ['Session ended image', '<img src="ended.png">'],
    ]));
    expect(config.alsoLiveTitle).to.equal('Live Now');
    expect(config.upcomingTitle).to.equal('Coming Up');
    expect(config.viewAllDetailsLabel).to.equal('See more');
    expect(config.sessionEndedImageHtml).to.include('ended.png');
  });

  it('falls back to the default for any row left unauthored, independently of the others', () => {
    const config = parseBroadcastConfig(block([['Also live title', 'Live Now']]));
    expect(config.alsoLiveTitle).to.equal('Live Now');
    expect(config.upcomingTitle).to.equal('Upcoming');
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
