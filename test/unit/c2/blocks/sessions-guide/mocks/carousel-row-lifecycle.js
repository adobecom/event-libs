import { setupGlobalMocks, eventConfig } from '../../../../scripts/mocks/event-config.js';

setupGlobalMocks();
const { setEventConfig } = await import('../../../../../../event-libs/v1/utils/utils.js');
setEventConfig(eventConfig, eventConfig.miloConfig);

const { h, render, options } = await import('../../../../../../event-libs/v1/deps/htm-preact.js');
// Flush lifecycle effects without bringing concurrent test tabs to the foreground.
options.requestAnimationFrame = (callback) => setTimeout(callback, 0);
const matchMedia = window.matchMedia.bind(window);
const desktopMedia = matchMedia('(min-width: 1280px)');
window.matchMedia = (query) => (query === '(min-width: 1280px)' ? desktopMedia : matchMedia(query));
// Background frames can defer native media-query events; deliver the actual current match explicitly.
window.resizeCarouselRow = () => desktopMedia.dispatchEvent(new MediaQueryListEvent('change', {
  matches: desktopMedia.matches,
  media: desktopMedia.media,
}));
const { SessionGuideContext } = await import('../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js');
const { TrackRow } = await import('../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/TrackRow.js');
const { TimeSlotRow } = await import('../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/TimeSlotRow.js');
const { favorited, scheduled } = await import('../../../../../../event-libs/v1/utils/session-store.js');

const Row = document.body.dataset.rowType === 'track' ? TrackRow : TimeSlotRow;
const root = document.querySelector('.sg-portal');
root.replaceChildren();
const style = document.createElement('style');
style.textContent = '.sg-time-row__cards, .sg-time-row__card-wrap, .sg-card { transition: none !important; }';
document.head.append(style);
let sessions = [];
let state = {
  guideConfig: { userTz: 'America/Los_Angeles' },
  activeDay: '2099-10-28',
  activeFilters: {},
  searchQuery: '',
  dismissingIds: new Set(),
};

window.updateCarouselRow = ({ ids, favoriteIds, scheduledIds, ...patch } = {}) => {
  if (ids) {
    sessions = ids.map((id) => ({
      id,
      title: `Photoshop ${id}`,
      description: 'Carousel lifecycle session',
      primaryTrack: 'Design',
      startTimeUtc: '2099-10-28T17:00:00Z',
      endTimeUtc: '2099-10-28T18:00:00Z',
      inPerson: false,
      sessionPageUrl: `/sessions/${id}`,
    }));
  }
  if (favoriteIds) favorited.value = new Set(favoriteIds);
  if (scheduledIds) scheduled.value = new Set(scheduledIds);
  state = { ...state, ...patch };
  render(h(SessionGuideContext.Provider, { value: { state, dispatch: () => {} } },
    h(Row, { track: 'Design', sessions, forceOnDemand: true })), root);
};
window.updateCarouselRow({ ids: Array.from({ length: 20 }, (_, i) => String(i)) });
window.dispatchEvent(new Event('carousel-row-test-ready'));
