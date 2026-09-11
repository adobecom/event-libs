import { expect } from '@esm-bundle/chai';
import { mountNotificationWidget } from '../../../../event-libs/v1/features/swan-notifications/notification-widget.js';
import {
  getEntries, removeEntry, upsertEntry,
} from '../../../../event-libs/v1/features/swan-notifications/notification-store.js';

function clearStore() {
  getEntries().forEach((entry) => removeEntry(entry.rfCode));
}

describe('notification-widget', () => {
  let mountPoint;

  function bell() { return mountPoint.querySelector('.swan-notif__bell'); }
  function panel() { return mountPoint.querySelector('.swan-notif__panel'); }
  function badge() { return mountPoint.querySelector('.swan-notif__badge'); }
  function sectionTitle() { return mountPoint.querySelector('.swan-notif__section-title'); }
  function rows() { return [...mountPoint.querySelectorAll('.swan-notif__row')]; }

  function addEntry(rfCode, overrides) {
    upsertEntry(rfCode, { category: 'Adobe Test Event Session', ...overrides });
  }

  before(async () => {
    mountPoint = document.createElement('div');
    mountPoint.id = 'universal-nav';
    document.body.append(mountPoint);

    // mountNotificationWidget() is a module-level singleton (guarded by its own `mounted`
    // flag), so it's called exactly once for this whole file; every test below interacts
    // with this one mounted instance via the real, shared notification-store.js.
    mountNotificationWidget();
    // `#universal-nav` already exists, so waitForElement() resolves on a microtask —
    // this macrotask tick guarantees buildWidget() has already run.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  after(() => {
    mountPoint.remove();
  });

  beforeEach(() => {
    clearStore();
    panel().hidden = true;
  });

  it('mounts exactly one bell button and panel into #universal-nav', () => {
    expect(mountPoint.querySelectorAll('.swan-notif__bell')).to.have.lengthOf(1);
    expect(mountPoint.querySelectorAll('.swan-notif__panel')).to.have.lengthOf(1);
  });

  it('re-inserts the bell if something else clears #universal-nav (e.g. UniversalNav.js re-rendering)', async () => {
    expect(mountPoint.querySelector('.swan-notif')).to.not.equal(null);
    mountPoint.replaceChildren();
    expect(mountPoint.querySelector('.swan-notif')).to.equal(null);
    // MutationObserver callbacks run as a microtask — a macrotask tick guarantees it has
    // already fired by the time this assertion runs.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mountPoint.querySelector('.swan-notif')).to.not.equal(null);
  });

  it('shows an empty-state message and a hidden badge when there are no notifications', () => {
    expect(mountPoint.querySelector('.swan-notif__empty')).to.not.equal(null);
    expect(badge().hidden).to.equal(true);
  });

  it('hides the "Important" section header when there are no notifications', () => {
    expect(sectionTitle().hidden).to.equal(true);
  });

  it('shows the "Important" section header once there is at least one notification', () => {
    addEntry('RF-1', { stage: 'reminder', title: 'First' });
    expect(sectionTitle().hidden).to.equal(false);
    expect(sectionTitle().textContent).to.equal('Important');
  });

  it('renders the category kicker on its own line, separate from the title', () => {
    addEntry('RF-1', { stage: 'reminder', title: 'First', category: 'Adobe MAX Session' });
    const row = rows()[0];
    expect(row.querySelector('.swan-notif__category').textContent).to.equal('Adobe MAX Session');
    expect(row.querySelector('.swan-notif__title').textContent).to.equal('First');
  });

  it('labels the on-demand stage pill "On-Demand"', () => {
    addEntry('RF-1', { stage: 'on-demand', title: 'First' });
    expect(rows()[0].querySelector('.swan-notif__pill').textContent).to.equal('On-Demand');
  });

  it('renders one row per stored entry, most recently updated first', () => {
    addEntry('RF-1', { stage: 'reminder', title: 'First' });
    addEntry('RF-2', { stage: 'live', title: 'Second' });
    const titles = rows().map((row) => row.querySelector('.swan-notif__title').textContent);
    expect(titles).to.deep.equal(['Second', 'First']);
  });

  it('labels each row with its stage pill', () => {
    addEntry('RF-1', { stage: 'reminder', title: 'First' });
    addEntry('RF-2', { stage: 'live', title: 'Second' });
    const pills = rows().map((row) => row.querySelector('.swan-notif__pill').textContent);
    expect(pills).to.deep.equal(['Live', 'Upcoming']);
  });

  it('shows the unread badge count, capped at "9+"', () => {
    for (let i = 0; i < 11; i += 1) addEntry(`RF-${i}`, { stage: 'reminder', title: `S${i}` });
    expect(badge().hidden).to.equal(false);
    expect(badge().textContent).to.equal('9+');
  });

  it('hides the badge once every entry has been read', () => {
    addEntry('RF-1', { stage: 'reminder', title: 'First' });
    expect(badge().hidden).to.equal(false);
    rows()[0].click();
    expect(badge().hidden).to.equal(true);
  });

  it('marks a new entry unread until its row is clicked', () => {
    addEntry('RF-1', { stage: 'reminder', title: 'First' });
    expect(rows()[0].classList.contains('swan-notif__row--unread')).to.equal(true);
    rows()[0].click();
    expect(rows()[0].classList.contains('swan-notif__row--unread')).to.equal(false);
  });

  it('marks the entry read in the store when its row is activated', () => {
    addEntry('RF-1', { stage: 'reminder', title: 'First' });
    rows()[0].click();
    expect(getEntries().find((e) => e.rfCode === 'RF-1').read).to.equal(true);
  });

  it('marks the entry read on Enter/Space, not just a mouse click', () => {
    addEntry('RF-1', { stage: 'reminder', title: 'First' });
    rows()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(getEntries().find((e) => e.rfCode === 'RF-1').read).to.equal(true);
  });

  it('opens and closes the panel on bell click', () => {
    expect(panel().hidden).to.equal(true);
    bell().click();
    expect(panel().hidden).to.equal(false);
    expect(bell().getAttribute('aria-expanded')).to.equal('true');
    bell().click();
    expect(panel().hidden).to.equal(true);
    expect(bell().getAttribute('aria-expanded')).to.equal('false');
  });

  it('clears the badge on open, even for rows never individually clicked', () => {
    addEntry('RF-1', { stage: 'reminder', title: 'First' });
    addEntry('RF-2', { stage: 'reminder', title: 'Second' });
    expect(badge().hidden).to.equal(false);
    bell().click();
    expect(badge().hidden).to.equal(true);
    expect(getEntries().every((entry) => entry.read)).to.equal(true);
  });

  it('closes the panel on an outside click', () => {
    bell().click();
    expect(panel().hidden).to.equal(false);
    document.body.click();
    expect(panel().hidden).to.equal(true);
  });

  it('closes the panel on Escape', () => {
    bell().click();
    expect(panel().hidden).to.equal(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(panel().hidden).to.equal(true);
  });

  it('does not mount a second widget on a repeated call', () => {
    mountNotificationWidget();
    expect(mountPoint.querySelectorAll('.swan-notif__bell')).to.have.lengthOf(1);
  });
});
