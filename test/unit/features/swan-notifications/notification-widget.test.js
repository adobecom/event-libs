import { expect } from '@esm-bundle/chai';
import { mountNotificationWidget, normalizeTimeCasing } from '../../../../event-libs/v1/features/swan-notifications/notification-widget.js';
import {
  getEntries, removeEntry, upsertEntry,
} from '../../../../event-libs/v1/features/swan-notifications/notification-store.js';
import { setFederalRootOverride } from '../../../../event-libs/v1/features/icons/federal-icons.js';

function clearStore() {
  getEntries().forEach((entry) => removeEntry(entry.rfCode));
}

// Same-origin, genuinely loadable asset — unlike an https://example.com/... URL (blocked by
// the test harness's no-external-network rule), this actually loads, so tests using it exercise
// a real successful <img>, not a load that was always going to fail anyway.
const REAL_THUMBNAIL_URL = '/test/unit/features/icons/mocks/federal/federal/assets/svgs/creative-cloud-64.svg';

// Polls instead of a fixed sleep for an async fetch (e.g. fetchFederalTrackIcon) to resolve
// and update the DOM — a fixed wait is either too short under a loaded CI machine (flaky) or
// wastefully long otherwise.
async function waitFor(predicate, { timeout = 1000, interval = 10 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => { setTimeout(resolve, interval); });
  }
  throw new Error('waitFor: condition never became true');
}

describe('notification-widget', () => {
  let mountPoint;

  function bell() { return mountPoint.querySelector('.swan-notif__bell'); }
  function panel() { return mountPoint.querySelector('.swan-notif__panel'); }
  function badge() { return mountPoint.querySelector('.swan-notif__badge'); }
  function tooltip() { return mountPoint.querySelector('.swan-notif__tooltip'); }
  function sectionTitle() { return mountPoint.querySelector('.swan-notif__section-title'); }
  function rows() { return [...mountPoint.querySelectorAll('.swan-notif__row')]; }
  function announcer() { return mountPoint.querySelector('.swan-notif__sr-only'); }

  function addEntry(rfCode, overrides) {
    upsertEntry(rfCode, { category: 'Adobe Test Event Session', ...overrides });
  }

  before(async () => {
    const gnavNotificationsMeta = document.createElement('meta');
    gnavNotificationsMeta.name = 'gnav-notifications';
    gnavNotificationsMeta.content = 'on';
    document.head.appendChild(gnavNotificationsMeta);

    mountPoint = document.createElement('div');
    mountPoint.className = 'feds-notifications-wrapper';
    document.body.append(mountPoint);

    // mountNotificationWidget() is a module-level singleton (guarded by its own `mounted`
    // flag), so it's called exactly once for this whole file; every test below interacts
    // with this one mounted instance via the real, shared notification-store.js. This file
    // is the one sanctioned successful, permanent mount in the whole suite — it must run
    // after notification-widget-gnav-gate.test.js and notification-widget-mount-retry.test.js
    // (both of which deliberately never let a real build complete, so `mounted` reaches this
    // file still false); see either of their header comments for the full ordering chain.
    mountNotificationWidget();
    // `.feds-notifications-wrapper` already exists, so waitForElement() resolves on a
    // microtask — this macrotask tick guarantees buildWidget() has already run.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  after(() => {
    mountPoint.remove();
    document.head.querySelector('meta[name="gnav-notifications"]')?.remove();
  });

  beforeEach(() => {
    clearStore();
    panel().hidden = true;
  });

  it('mounts exactly one bell button and panel into .feds-notifications-wrapper', () => {
    expect(mountPoint.querySelectorAll('.swan-notif__bell')).to.have.lengthOf(1);
    expect(mountPoint.querySelectorAll('.swan-notif__panel')).to.have.lengthOf(1);
  });

  it('excludes the panel from Lenis smooth-scroll hijacking', () => {
    expect(panel().hasAttribute('data-lenis-prevent')).to.equal(true);
  });

  it('re-inserts the bell if something else clears .feds-notifications-wrapper (e.g. a gnav re-render)', async () => {
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

  it('labels the on-demand stage pill "On Demand"', () => {
    addEntry('RF-1', { stage: 'on-demand', title: 'First' });
    expect(rows()[0].querySelector('.swan-notif__pill').textContent).to.equal('On Demand');
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

  it('clears the badge and marks all entries read when the panel opens', () => {
    addEntry('RF-1', { stage: 'reminder', title: 'First' });
    addEntry('RF-2', { stage: 'reminder', title: 'Second' });
    expect(badge().hidden).to.equal(false);
    bell().click();
    expect(badge().hidden).to.equal(true);
    expect(getEntries().every((entry) => entry.read)).to.equal(true);
    expect(rows().every((row) => !row.classList.contains('swan-notif__row--unread'))).to.equal(true);
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

  describe('hover tooltip', () => {
    // Real mouse/CDP-driven hover simulation (sendMouse) is too flaky under full-suite
    // concurrent test execution (CDP command contention across many parallel browser
    // sessions) to assert real-time delay behavior reliably, so this reads the actual
    // CSSOM rule instead of simulating :hover. loadStyle()'s <link> is fetched
    // asynchronously, so document.styleSheets may not have parsed it yet the moment this
    // describe block runs — poll until it has, rather than racing it.
    async function loadedStylesheet() {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const sheet = [...document.styleSheets].find((s) => s.href?.includes('notification-widget.css'));
        if (sheet) {
          try {
            if (sheet.cssRules.length) return sheet;
          } catch { /* not yet parsed */ }
        }
        await new Promise((resolve) => { setTimeout(resolve, 20); });
      }
      throw new Error('notification-widget.css never became queryable via document.styleSheets');
    }

    async function findHoverRule() {
      const sheet = await loadedStylesheet();
      const mediaRule = [...sheet.cssRules].find((rule) => rule instanceof CSSMediaRule);
      return [...mediaRule.cssRules].find((rule) => rule.selectorText.includes(':hover'));
    }

    it('renders a hidden-from-AT tooltip labeled "Notifications" right after the bell', () => {
      expect(tooltip().getAttribute('aria-hidden')).to.equal('true');
      expect(tooltip().querySelector('.swan-notif__tooltip-label').textContent).to.equal('Notifications');
      expect(bell().nextElementSibling).to.equal(tooltip());
    });

    it('is hidden natively at creation time, not only via the external stylesheet', () => {
      expect(tooltip().hidden).to.equal(true);
    });

    it('is hidden by default via a visibility transition, not display, so a delay can apply', async () => {
      await loadedStylesheet();
      expect(getComputedStyle(tooltip()).visibility).to.equal('hidden');
    });

    it('shows the tooltip only after a 2s hover/focus-visible delay', async () => {
      const rule = await findHoverRule();
      expect(rule.style.visibility).to.equal('visible');
      expect(rule.style.transitionDelay).to.equal('2s');
    });

    it('has no delay on the base (hidden) state, so leaving hover hides it immediately', async () => {
      const sheet = await loadedStylesheet();
      const baseRule = [...sheet.cssRules].find((rule) => rule.selectorText === '.swan-notif__tooltip');
      expect(baseRule.style.transitionDelay).to.equal('0s');
    });
  });

  describe('closing other gnav popups', () => {
    let gnav;
    let profileTrigger;

    beforeEach(() => {
      gnav = document.createElement('header');
      gnav.className = 'global-navigation';
      profileTrigger = document.createElement('button');
      profileTrigger.setAttribute('aria-expanded', 'true');
      gnav.append(profileTrigger);
      document.body.append(gnav);
    });

    afterEach(() => {
      if (!panel().hidden) bell().click();
      gnav.remove();
    });

    it('closes an already-open gnav popup when the bell opens', () => {
      bell().click();
      expect(profileTrigger.getAttribute('aria-expanded')).to.equal('false');
    });

    it('still expands the bell itself', () => {
      bell().click();
      expect(bell().getAttribute('aria-expanded')).to.equal('true');
    });

    it('leaves aria-expanded elements outside header.global-navigation alone', () => {
      const outside = document.createElement('button');
      outside.setAttribute('aria-expanded', 'true');
      document.body.append(outside);
      bell().click();
      expect(outside.getAttribute('aria-expanded')).to.equal('true');
      outside.remove();
    });
  });

  describe('analytics attributes', () => {
    it('tags the bell button for click tracking', () => {
      expect(bell().getAttribute('daa-ll')).to.equal('Notification-Bell-Open');
    });

    it('tags each row with the session title for click tracking', () => {
      addEntry('RF-1', { stage: 'reminder', title: 'First' });
      expect(rows()[0].getAttribute('daa-ll')).to.equal('Notification-Row-Click|First');
    });
  });

  describe('dismiss button', () => {
    it('renders one dismiss button per row', () => {
      addEntry('RF-1', { stage: 'reminder', title: 'First' });
      expect(rows()[0].querySelectorAll('.swan-notif__dismiss')).to.have.lengthOf(1);
    });

    it('hides only the dismissed entry\'s row, without deleting it from the store', () => {
      addEntry('RF-1', { stage: 'reminder', title: 'First' });
      addEntry('RF-2', { stage: 'reminder', title: 'Second' });
      // Same stage, so rows()[0] is the more recently added one (RF-2) — see the sort-order
      // tests in notification-store.test.js.
      rows()[0].querySelector('.swan-notif__dismiss').click();
      // Dismiss keeps the entry (marked dismissed) rather than deleting it — a still-scheduled
      // session's next reconcile tick needs it to avoid resurrecting the notification. See
      // swan-notifications.test.js's dismiss-resurrection regression tests.
      expect(getEntries().find((e) => e.rfCode === 'RF-2').dismissed).to.equal(true);
      expect(rows().map((row) => row.dataset.rfcode)).to.deep.equal(['RF-1']);
    });

    it('does not mark the entry read or navigate — only the row itself does that', () => {
      addEntry('RF-1', { stage: 'reminder', title: 'First', actionUrl: '' });
      rows()[0].querySelector('.swan-notif__dismiss').click();
      const entry = getEntries().find((e) => e.rfCode === 'RF-1');
      expect(entry.dismissed).to.equal(true);
      // read stays false, proving the row's own click-through handler never ran as a side
      // effect of the dismiss click (it would have called markRead first).
      expect(entry.read).to.equal(false);
    });

    // .focus() (unlike .click()) is a no-op on an element inside a hidden ancestor, so these
    // two need the panel actually open — matching how a keyboard user would really reach a
    // dismiss button in the first place.
    it('moves focus to the next remaining row\'s dismiss button, so keyboard focus never falls back to <body>', () => {
      addEntry('RF-1', { stage: 'reminder', title: 'First' });
      addEntry('RF-2', { stage: 'reminder', title: 'Second' });
      bell().click(); // open the panel
      const firstDismiss = rows()[0].querySelector('.swan-notif__dismiss');
      firstDismiss.focus();
      firstDismiss.click();
      expect(document.activeElement.classList.contains('swan-notif__dismiss')).to.equal(true);
      expect(document.activeElement).to.not.equal(firstDismiss); // the old node was destroyed
    });

    it('falls back to the bell button once the last entry is dismissed', () => {
      addEntry('RF-1', { stage: 'reminder', title: 'Only one' });
      bell().click(); // open the panel
      const dismiss = rows()[0].querySelector('.swan-notif__dismiss');
      dismiss.focus();
      dismiss.click();
      expect(document.activeElement).to.equal(bell());
    });
  });

  describe('aria-live announcer', () => {
    it('renders a visually-hidden role="status" live region', () => {
      expect(announcer()).to.not.equal(null);
      expect(announcer().getAttribute('role')).to.equal('status');
      expect(announcer().getAttribute('aria-live')).to.equal('polite');
    });

    it('announces when the unread count increases', () => {
      addEntry('RF-1', { stage: 'reminder', title: 'First' });
      expect(announcer().textContent).to.equal('1 new notification');
      addEntry('RF-2', { stage: 'reminder', title: 'Second' });
      expect(announcer().textContent).to.equal('2 new notifications');
    });

    it('does not re-announce when the count only decreases (e.g. a read/dismiss)', () => {
      addEntry('RF-1', { stage: 'reminder', title: 'First' });
      expect(announcer().textContent).to.equal('1 new notification');
      rows()[0].click(); // marks read, unread count drops to 0
      expect(announcer().textContent).to.equal('1 new notification');
    });
  });

  describe('reminder start-time line', () => {
    it('shows a formatted start time for a reminder-stage row', () => {
      const startTimeMs = Date.parse('2026-10-28T16:00:00.000Z');
      const endTimeMs = Date.parse('2026-10-28T17:00:00.000Z');
      addEntry('RF-1', {
        stage: 'reminder', title: 'First', startTimeMs, endTimeMs,
      });
      const timeLines = rows()[0].querySelectorAll('.swan-notif__time');
      expect(timeLines).to.have.lengthOf(2); // start time + relative "updated" time
      expect(timeLines[0].textContent).to.include('Oct');
    });

    it('formats the start-time line without a day-of-week and with a comma separator', () => {
      const startTimeMs = Date.parse('2026-10-28T16:00:00.000Z');
      const endTimeMs = Date.parse('2026-10-28T17:00:00.000Z');
      addEntry('RF-1', {
        stage: 'reminder', title: 'First', startTimeMs, endTimeMs,
      });
      const text = rows()[0].querySelectorAll('.swan-notif__time')[0].textContent;
      // No day-of-week token and no "·" separator (was '{ddd}, {LLL} {dd} · ...').
      expect(text).to.not.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/);
      expect(text).to.not.include('·');
      // Date and time range are joined by ", " (from the template's literal comma).
      expect(text).to.match(/^Oct \d{2}, /);
      // Hours have no leading zero and lowercase am/pm with no leading space (tz-independent).
      expect(text).to.not.match(/\b0\d:/);
      expect(text).to.not.match(/\s(AM|PM)\b/);
      expect(text).to.match(/(am|pm)\b/);
    });

    it('does not show a start-time line for a live or on-demand row', () => {
      addEntry('RF-1', { stage: 'live', title: 'First' });
      const timeLines = rows()[0].querySelectorAll('.swan-notif__time');
      expect(timeLines).to.have.lengthOf(1); // relative "updated" time only
    });
  });

  // Exercised on full '{LLL} {dd}, {timeRange} {timeZone}' strings (not just the time portion)
  // so the leading-zero rule is proven not to touch the day-of-month number. Uses literal
  // inputs because the rendered widget resolves the viewer's local timezone, which isn't
  // deterministic across CI environments.
  describe('normalizeTimeCasing', () => {
    it('drops a leading zero on a single-digit hour and lowercases the meridiem on both times', () => {
      expect(normalizeTimeCasing('Nov 10, 06:00 AM - 08:00 AM PST'))
        .to.equal('Nov 10, 6:00am - 8:00am PST');
    });

    it('leaves an already-two-digit hour intact while still lowercasing the meridiem', () => {
      expect(normalizeTimeCasing('Nov 10, 11:00 AM - 12:30 PM PST'))
        .to.equal('Nov 10, 11:00am - 12:30pm PST');
    });

    it('does not strip a leading zero from the day-of-month number (e.g. "06")', () => {
      // "06" here is the {dd} day-of-month, which must survive untouched — the hour rule
      // only fires on a zero immediately followed by "H:MM".
      const out = normalizeTimeCasing('Nov 06, 06:00 AM - 08:00 AM PST');
      expect(out).to.equal('Nov 06, 6:00am - 8:00am PST');
      expect(out).to.include('Nov 06,');
    });

    it('does not alter a year number that could appear in a custom template', () => {
      // A leading-zero-free 4-digit year like "2026" must not be mangled.
      expect(normalizeTimeCasing('Nov 06 2026, 06:00 AM PST'))
        .to.equal('Nov 06 2026, 6:00am PST');
    });
  });

  describe('track icon fallback', () => {
    before(() => {
      setFederalRootOverride('/test/unit/features/icons/mocks/federal');
    });

    function icon() { return rows()[0].querySelector('.swan-notif__icon'); }

    it('shows SESSION_ICON_FALLBACK immediately for a row with no iconUrl and no trackIconName', () => {
      addEntry('RF-1', { stage: 'reminder', title: 'First' });
      expect(icon().classList.contains('swan-notif__icon--placeholder')).to.equal(true);
      expect(icon().querySelector('svg.icon-federal')).to.equal(null);
    });

    it('swaps in the resolved track icon once fetchFederalTrackIcon resolves', async () => {
      addEntry('RF-1', { stage: 'reminder', title: 'First', trackIconName: 'branding' });
      await waitFor(() => icon().querySelector('svg.icon-federal'));
      expect(icon().querySelector('svg').classList.contains('icon-federal-branding')).to.equal(true);
    });

    it('leaves SESSION_ICON_FALLBACK in place when the named track icon does not resolve', async () => {
      addEntry('RF-1', { stage: 'reminder', title: 'First', trackIconName: 'does-not-exist-anywhere' });
      await new Promise((resolve) => { setTimeout(resolve, 250); });
      expect(icon().querySelector('svg.icon-federal')).to.equal(null);
    });

    it('renders the thumbnail immediately, then swaps to the track icon once it resolves, since track icon wins', async () => {
      addEntry('RF-1', {
        stage: 'reminder', title: 'First', iconUrl: REAL_THUMBNAIL_URL, trackIconName: 'branding',
      });
      expect(icon().tagName).to.equal('IMG');
      await waitFor(() => icon().querySelector('svg.icon-federal'));
      expect(icon().querySelector('svg').classList.contains('icon-federal-branding')).to.equal(true);
    });

    it('keeps the thumbnail when the named track icon does not resolve', async () => {
      addEntry('RF-1', {
        stage: 'reminder', title: 'First', iconUrl: REAL_THUMBNAIL_URL, trackIconName: 'does-not-exist-anywhere',
      });
      await new Promise((resolve) => { setTimeout(resolve, 250); });
      expect(icon().tagName).to.equal('IMG');
    });
  });

  describe('broken thumbnail fallback', () => {
    before(() => {
      setFederalRootOverride('/test/unit/features/icons/mocks/federal');
    });

    function icon() { return rows()[0].querySelector('.swan-notif__icon'); }

    it('falls back to the track-icon placeholder when the <img> fails to load', () => {
      addEntry('RF-1', {
        stage: 'reminder', title: 'First', iconUrl: 'https://example.com/broken.png', trackIconName: 'branding',
      });
      const img = icon();
      expect(img.tagName).to.equal('IMG');
      img.dispatchEvent(new Event('error'));
      expect(icon().classList.contains('swan-notif__icon--placeholder')).to.equal(true);
    });

    it('does not touch a disconnected row\'s <img> if the error fires after the list was rebuilt', () => {
      addEntry('RF-1', { stage: 'reminder', title: 'First', iconUrl: 'https://example.com/broken.png' });
      const staleImg = icon();
      addEntry('RF-2', { stage: 'live', title: 'Second' }); // rebuilds the whole list
      expect(() => staleImg.dispatchEvent(new Event('error'))).to.not.throw();
      expect(staleImg.isConnected).to.equal(false);
    });

    it('still upgrades to the track icon after falling back to the MAX badge, once the fetch resolves', async () => {
      addEntry('RF-1', {
        stage: 'reminder', title: 'First', iconUrl: 'https://example.com/broken.png', trackIconName: 'branding',
      });
      icon().dispatchEvent(new Event('error'));
      expect(icon().classList.contains('swan-notif__icon--placeholder')).to.equal(true);
      await waitFor(() => icon().querySelector('svg.icon-federal'));
      expect(icon().querySelector('svg').classList.contains('icon-federal-branding')).to.equal(true);
    });

    it('does not let a late thumbnail error undo an already-resolved track icon', async () => {
      addEntry('RF-1', {
        stage: 'reminder', title: 'First', iconUrl: REAL_THUMBNAIL_URL, trackIconName: 'branding',
      });
      const img = icon();
      await waitFor(() => icon().querySelector('svg.icon-federal-branding'));
      expect(icon().querySelector('svg.icon-federal-branding')).to.not.equal(null);
      expect(() => img.dispatchEvent(new Event('error'))).to.not.throw();
      expect(icon().querySelector('svg.icon-federal-branding')).to.not.equal(null);
    });
  });
});
