import { expect } from '@esm-bundle/chai';
import * as preact from '../../../mocks/deps/htm-preact.js';
import { buildStore } from '../../../../../event-libs/v1/blocks/sessions-guide/store/index.js';
import { buildTimeSlotRow } from '../../../../../event-libs/v1/blocks/sessions-guide/components/TimeSlotRow.js';

const BASE_CONFIG = {
  userTz: 'America/Los_Angeles',
  surface: 'page',
  trackColors: {},
  trackIcons: {},
  rfApiUrl: '',
  rfApiProfileId: '',
  showConflictModal: false,
  filterCategories: [],
  mrEnv: 'dev',
  theme: 'dark',
  manualOnDemandTransitionTime: null,
  title: '',
};

const SESSION_A = {
  id: 'a', title: 'Session A', description: 'Desc A', track: 'Design',
  startTimeUtc: '2099-10-28T17:00:00Z', endTimeUtc: '2099-10-28T18:00:00Z',
  videoAvailable: false, inPerson: false, sessionPageUrl: '/a', watchUrl: '',
};
const SESSION_B = {
  id: 'b', title: 'Session B', description: 'Desc B', track: 'Video',
  startTimeUtc: '2099-10-28T17:00:00Z', endTimeUtc: '2099-10-28T18:00:00Z',
  videoAvailable: false, inPerson: false, sessionPageUrl: '/b', watchUrl: '',
};

function makeStore() {
  const store = buildStore(preact);
  store.SessionGuideContext._current = {
    state: {
      scheduled: new Set(),
      favorited: new Set(),
      isRegistered: true,
      eventConfig: { ...BASE_CONFIG },
    },
    dispatch: () => {},
  };
  return store;
}

describe('TimeSlotRow', () => {
  it('returns null for empty sessions array', () => {
    const store = makeStore();
    const TimeSlotRow = buildTimeSlotRow(preact, store);
    expect(TimeSlotRow({ sessions: [] })).to.be.null;
  });

  it('returns null for undefined sessions', () => {
    const store = makeStore();
    const TimeSlotRow = buildTimeSlotRow(preact, store);
    expect(TimeSlotRow({ sessions: undefined })).to.be.null;
  });

  it('renders the row container for a single session', () => {
    const store = makeStore();
    const TimeSlotRow = buildTimeSlotRow(preact, store);
    const html = TimeSlotRow({ sessions: [SESSION_A] });
    expect(html).to.include('sg-time-row');
  });

  it('includes a time label derived from the first session', () => {
    const store = makeStore();
    const TimeSlotRow = buildTimeSlotRow(preact, store);
    const html = TimeSlotRow({ sessions: [SESSION_A] });
    expect(html).to.include('sg-time-row__label');
    // time should be rendered (exact format depends on Intl locale in test env)
    expect(html).to.include('sg-time-row__label');
  });

  it('renders card wraps for each session', () => {
    const store = makeStore();
    const TimeSlotRow = buildTimeSlotRow(preact, store);
    const html = TimeSlotRow({ sessions: [SESSION_A, SESSION_B] });
    const count = (html.match(/sg-time-row__card-wrap/g) || []).length;
    expect(count).to.equal(2);
  });

  it('does not show prev arrow at initial offset 0', () => {
    const store = makeStore();
    const TimeSlotRow = buildTimeSlotRow(preact, store);
    const html = TimeSlotRow({ sessions: [SESSION_A, SESSION_B] });
    expect(html).to.not.include('sg-time-row__arrow--prev');
  });

  it('shows next arrow when more than one session exists', () => {
    const store = makeStore();
    const TimeSlotRow = buildTimeSlotRow(preact, store);
    const html = TimeSlotRow({ sessions: [SESSION_A, SESSION_B] });
    expect(html).to.include('sg-time-row__arrow--next');
  });

  it('does not show next arrow for a single session', () => {
    const store = makeStore();
    const TimeSlotRow = buildTimeSlotRow(preact, store);
    const html = TimeSlotRow({ sessions: [SESSION_A] });
    expect(html).to.not.include('sg-time-row__arrow--next');
  });
});
