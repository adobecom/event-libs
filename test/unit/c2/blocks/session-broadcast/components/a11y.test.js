import { h, render } from '../../../../../../event-libs/v1/deps/htm-preact.js';
import { favorited, pendingActions } from '../../../../../../event-libs/v1/utils/session-store.js';
import { SessionGuideProvider } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js';
import { SessionInfoPanel } from '../../../../../../event-libs/v1/c2/blocks/session-broadcast/components/SessionInfoPanel.js';
import { EndedState } from '../../../../../../event-libs/v1/c2/blocks/session-broadcast/components/EndedState.js';
import { PlayerHost } from '../../../../../../event-libs/v1/c2/blocks/session-broadcast/components/PlayerHost.js';
import { AlsoLiveCarousel } from '../../../../../../event-libs/v1/c2/blocks/session-broadcast/components/AlsoLiveCarousel.js';
import { UpNextCarousel } from '../../../../../../event-libs/v1/c2/blocks/session-broadcast/components/UpNextCarousel.js';
import { expectAccessible } from '../../../../helpers/a11y.js';

/*
 * Structural WCAG 2.1 AA scans of the session-broadcast components.
 *
 * These cover accessible names, roles, and initial ARIA on real DOM. They do NOT cover
 * keyboard handling, focus movement, or effect-driven ARIA (the player adapters mount real
 * third-party iframes in a real browser only — see YouTubePlayerAdapter.test.js/
 * MpcPlayerAdapter.test.js), and they do NOT cover the reused sessions-guide Carousel/LiveCard
 * internals (already scanned by sessions-guide's own a11y.test.js) — only the wrapping section
 * markup this block owns.
 */

const HOUR = 3600e3;

const SESSION = {
  id: 's-1',
  title: 'Pixel & Product: Scalable Visual Systems',
  description: 'A deep dive into building visual systems that scale across brands.',
  startTimeUtc: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  endTimeUtc: new Date(Date.now() + HOUR).toISOString(),
  sessionPageUrl: '/s/s-1',
};

const OTHER_LIVE = { ...SESSION, id: 's-2', title: 'Design Better in Illustrator' };
const UPCOMING = { ...SESSION, id: 's-3', title: 'Premiere Pro: Edit Faster' };

const guideConfig = { surface: 'page', theme: 'light', userTz: 'America/Los_Angeles' };

function mount(Component, props = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  render(h(SessionGuideProvider, { guideConfig }, h(Component, props)), host);
  return host;
}

describe('session-broadcast a11y', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    favorited.value = new Set();
    pendingActions.value = new Set();
  });

  it('SessionInfoPanel labels its favorite and expand controls', async () => {
    await expectAccessible(mount(SessionInfoPanel, { session: SESSION }));
  });

  it('SessionInfoPanel keeps its controls labelled once favorited', async () => {
    favorited.value = new Set([SESSION.id]);
    await expectAccessible(mount(SessionInfoPanel, { session: SESSION }));
  });

  it('EndedState labels its favorite control and watch-on-demand link', async () => {
    await expectAccessible(mount(EndedState, { session: SESSION }));
  });

  it('PlayerHost names the unsupported-player-type status message', async () => {
    await expectAccessible(mount(PlayerHost, { session: { id: 's-4' } }));
  });

  it('AlsoLiveCarousel names its region', async () => {
    await expectAccessible(mount(AlsoLiveCarousel, { sessions: [SESSION, OTHER_LIVE] }));
  });

  it('UpNextCarousel names its region', async () => {
    await expectAccessible(mount(UpNextCarousel, { sessions: [UPCOMING] }));
  });
});
