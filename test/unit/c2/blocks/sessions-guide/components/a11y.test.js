import { h, render } from '../../../../../../event-libs/v1/deps/htm-preact.js';
import {
  sessions, sessionsStatus, scheduled, favorited, pendingActions, liveStreamActiveIds,
} from '../../../../../../event-libs/v1/utils/session-store.js';
import { SessionGuideProvider, SessionGuideContext } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js';
import { initTierOneEventConfig } from '../../../../../../event-libs/v1/utils/tier-1-event-config.js';
import { SessionCard } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/SessionCard.js';
import { LiveCard } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/LiveCard.js';
import { TimeSlotRow } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/TimeSlotRow.js';
import { Carousel } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/Carousel.js';
import { CategoryBadge } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/CategoryBadge.js';
import { ViewDropdown } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/ViewDropdown.js';
import { SessionDetailOverlay } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/SessionDetailOverlay.js';
import { expectAccessible } from '../../../../helpers/a11y.js';
import { SESSION_VARIANTS, CATALOG, TIER_ONE_CONFIG } from '../mocks/session-fixtures.js';

/*
 * Structural WCAG 2.1 AA scans of the sessions-guide components.
 *
 * These cover accessible names, roles, and initial ARIA on real DOM. They do NOT cover
 * keyboard handling, focus movement, or effect-driven ARIA — the test-time htm-preact mock
 * stubs useEffect/useLayoutEffect and attaches no event handlers. Use the `a11y` MCP server
 * against a running localhost:3868 page for those, and for computed colour contrast.
 */

const guideConfig = {
  surface: 'page',
  theme: 'light',
  userTz: 'America/Los_Angeles',
  registerUrl: '/register',
};

function mount(Component, props = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  render(h(SessionGuideProvider, { guideConfig }, h(Component, props)), host);
  return host;
}

describe('sessions-guide a11y', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    initTierOneEventConfig(TIER_ONE_CONFIG);
    sessions.value = CATALOG;
    sessionsStatus.value = 'ready';
    liveStreamActiveIds.value = new Set([SESSION_VARIANTS.live.id]);
    scheduled.value = new Set();
    favorited.value = new Set();
    pendingActions.value = new Set();
  });

  describe('SessionCard', () => {
    Object.entries(SESSION_VARIANTS).forEach(([state, session]) => {
      it(`labels every control for a ${state} session`, async () => {
        await expectAccessible(mount(SessionCard, { session }));
      });
    });

    it('keeps its controls labelled once scheduled and favorited', async () => {
      const session = SESSION_VARIANTS.upcoming;
      scheduled.value = new Set([session.id]);
      favorited.value = new Set([session.id]);
      await expectAccessible(mount(SessionCard, { session }));
    });

    it('keeps its controls labelled while an action is pending', async () => {
      const session = SESSION_VARIANTS.upcoming;
      pendingActions.value = new Set([session.id]);
      await expectAccessible(mount(SessionCard, { session }));
    });

    it('labels the forced on-demand variant', async () => {
      await expectAccessible(mount(SessionCard, {
        session: SESSION_VARIANTS.upcoming,
        forceOnDemand: true,
      }));
    });
  });

  it('LiveCard labels its schedule and favorite controls', async () => {
    await expectAccessible(mount(LiveCard, { session: SESSION_VARIANTS.live }));
  });

  it('TimeSlotRow labels its prev/next arrows', async () => {
    await expectAccessible(mount(TimeSlotRow, { sessions: CATALOG.slice(0, 3) }));
  });

  it('Carousel labels its arrows and names its region', async () => {
    await expectAccessible(mount(Carousel, {
      sessions: CATALOG.slice(0, 3),
      title: 'Live sessions',
      variant: 'live',
    }));
  });

  it('CategoryBadge exposes its track without a bare decorative icon', async () => {
    await expectAccessible(mount(CategoryBadge, { session: SESSION_VARIANTS.upcoming }));
  });

  it('ViewDropdown names its trigger', async () => {
    await expectAccessible(mount(ViewDropdown));
  });

  // The overlay reads activeSessionId off context rather than taking a session prop, so it
  // needs the context set directly — matching SessionDetailOverlay.test.js.
  describe('SessionDetailOverlay', () => {
    function mountOverlay(session) {
      sessions.value = [session];
      SessionGuideContext._current = {
        state: { activeSessionId: session.id, guideConfig },
        dispatch: () => {},
      };
      const host = document.createElement('div');
      document.body.appendChild(host);
      render(h(SessionDetailOverlay, { onBack: () => {} }), host);
      return host;
    }

    Object.entries(SESSION_VARIANTS).forEach(([state, session]) => {
      it(`names its regions and controls for a ${state} session`, async () => {
        await expectAccessible(mountOverlay(session));
      });
    });
  });
});
