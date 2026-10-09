import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  SEED_ID,
  seedYouTubeForLaunch,
  activateLaunchYouTube,
} from '../../../../event-libs/v1/c2/utils/youtube-launch-seed.js';

const MODULE = '../../../../event-libs/v1/c2/utils/youtube-launch-seed.js?';
let counter = 0;

// The module keeps a "seeded" flag, so each test imports a fresh copy.
async function freshSeed() {
  counter += 1;
  return import(`${MODULE}${counter}`);
}

function setup({ eventCode = 'max2026', schedule = true, youtubeBlock = false } = {}) {
  document.head.innerHTML = eventCode ? `<meta name="event-code" content="${eventCode}">` : '';
  document.body.innerHTML = [
    schedule ? '<div class="chrono-box"></div>' : '',
    youtubeBlock ? '<div class="event-youtube"></div>' : '',
  ].join('');
}

describe('youtube-launch-seed', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    delete window.YT;
    delete window.initiateYTubeTracking;
  });

  it('exports the seed helpers', () => {
    expect(seedYouTubeForLaunch).to.be.a('function');
    expect(activateLaunchYouTube).to.be.a('function');
  });

  it('inserts a Launch-matching hidden iframe for max2026 pages with a schedule', async () => {
    setup();
    const mod = await freshSeed();
    mod.seedYouTubeForLaunch();
    const seed = document.getElementById(SEED_ID);
    expect(seed).to.exist;
    expect(seed.id.startsWith('player-')).to.be.true;
    expect(seed.getAttribute('src')).to.include('youtube.com');
    expect(seed.getAttribute('src')).to.include('enablejsapi=1');
    expect(seed.getAttribute('aria-hidden')).to.equal('true');
  });

  it('also detects an unprocessed schedule-maker link', async () => {
    setup({ schedule: false });
    document.body.innerHTML = '<a href="https://example.com/schedule-maker?schedule=abc">x</a>';
    const mod = await freshSeed();
    mod.seedYouTubeForLaunch();
    expect(document.getElementById(SEED_ID)).to.exist;
  });

  it('does not seed for other event codes', async () => {
    setup({ eventCode: 'other2026' });
    const mod = await freshSeed();
    mod.seedYouTubeForLaunch();
    expect(document.getElementById(SEED_ID)).to.not.exist;
  });

  it('does not seed without an event-code', async () => {
    setup({ eventCode: '' });
    const mod = await freshSeed();
    mod.seedYouTubeForLaunch();
    expect(document.getElementById(SEED_ID)).to.not.exist;
  });

  it('does not seed without a schedule', async () => {
    setup({ schedule: false });
    const mod = await freshSeed();
    mod.seedYouTubeForLaunch();
    expect(document.getElementById(SEED_ID)).to.not.exist;
  });

  it('does not seed when an event-youtube block already exists', async () => {
    setup({ youtubeBlock: true });
    const mod = await freshSeed();
    mod.seedYouTubeForLaunch();
    expect(document.getElementById(SEED_ID)).to.not.exist;
  });

  it('seeds only once, even after the seed was removed', async () => {
    setup();
    const mod = await freshSeed();
    mod.seedYouTubeForLaunch();
    mod.seedYouTubeForLaunch();
    expect(document.querySelectorAll(`#${SEED_ID}`).length).to.equal(1);
    document.getElementById(SEED_ID).remove();
    mod.seedYouTubeForLaunch();
    expect(document.getElementById(SEED_ID)).to.not.exist;
  });

  describe('activateLaunchYouTube', () => {
    it('removes the seed', async () => {
      setup();
      const mod = await freshSeed();
      mod.seedYouTubeForLaunch();
      mod.activateLaunchYouTube();
      expect(document.getElementById(SEED_ID)).to.not.exist;
    });

    it('re-scans via initiateYTubeTracking when the YouTube API is loaded', () => {
      window.YT = { Player: function Player() {} };
      window.initiateYTubeTracking = sinon.spy();
      activateLaunchYouTube();
      expect(window.initiateYTubeTracking.calledOnce).to.be.true;
    });

    it('does not re-scan before the YouTube API is loaded', () => {
      window.initiateYTubeTracking = sinon.spy();
      activateLaunchYouTube();
      expect(window.initiateYTubeTracking.called).to.be.false;
    });

    it('swallows errors thrown by initiateYTubeTracking', () => {
      window.YT = { Player: function Player() {} };
      window.initiateYTubeTracking = () => { throw new Error('boom'); };
      expect(() => activateLaunchYouTube()).to.not.throw();
    });
  });
});
