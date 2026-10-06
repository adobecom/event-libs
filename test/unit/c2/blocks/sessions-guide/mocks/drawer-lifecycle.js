import { setupGlobalMocks, eventConfig } from '../../../../scripts/mocks/event-config.js';

setupGlobalMocks();
const { setEventConfig } = await import('../../../../../../event-libs/v1/utils/utils.js');
setEventConfig(eventConfig, eventConfig.miloConfig);

const { auth, sessionsStatus } = await import('../../../../../../event-libs/v1/utils/session-store.js');
auth.value = { isLoggedIn: false, isRegistered: false, userFirstName: null };
sessionsStatus.value = 'loading';

const matchMedia = window.matchMedia.bind(window);
window.matchMedia = (query) => (query === '(prefers-reduced-motion: reduce)'
  ? { matches: window.drawerTestReducedMotion }
  : matchMedia(query));

const { h, render } = await import('../../../../../../event-libs/v1/deps/htm-preact.js');
const { SessionGuideProvider } = await import('../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js');
const { DrawerShell } = await import('../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/DrawerShell.js');
const portal = document.querySelector('.sg-portal');
portal.replaceChildren();
render(h(SessionGuideProvider, {
  guideConfig: {
    headings: { loggedOut: 'Unregistered, find more inspiration' },
    registerUrl: '/register',
  },
}, h(DrawerShell)), portal);
window.dispatchEvent(new Event('drawer-test-ready'));
