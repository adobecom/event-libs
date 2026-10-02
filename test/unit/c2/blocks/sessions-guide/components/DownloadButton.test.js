import { expect } from '@esm-bundle/chai';
import { DownloadButton, downloadSchedule } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/DownloadButton.js';
import { sessions, scheduled } from '../../../../../../event-libs/v1/utils/session-store.js';
import { toasts } from '../../../../../../event-libs/v1/features/toast/toast.js';

function session(overrides = {}) {
  return {
    id: 's-1',
    title: 'A Session',
    description: '',
    startTimeUtc: '2026-10-28T17:00:00.000Z',
    endTimeUtc: '2026-10-28T18:00:00.000Z',
    speakers: [],
    sessionPageUrl: '',
    ...overrides,
  };
}

describe('DownloadButton', () => {
  let clicks;
  let originalClick;
  let downloads;
  let originalCreateObjectURL;

  beforeEach(() => {
    sessions.value = [];
    scheduled.value = new Set();
    toasts.value = [];
    clicks = [];
    downloads = [];
    originalClick = HTMLAnchorElement.prototype.click;
    originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = (blob) => {
      downloads.push(blob);
      return originalCreateObjectURL.call(URL, blob);
    };
    HTMLAnchorElement.prototype.click = function stubClick() {
      clicks.push({ href: this.href, download: this.download });
    };
  });

  afterEach(() => {
    HTMLAnchorElement.prototype.click = originalClick;
    URL.createObjectURL = originalCreateObjectURL;
  });

  describe('rendering', () => {
    it('is disabled when nothing is scheduled', () => {
      sessions.value = [session({ id: 'a' })];
      scheduled.value = new Set();
      expect(DownloadButton()).to.include('disabled');
    });

    it('is not disabled once at least one session is scheduled', () => {
      sessions.value = [session({ id: 'a' })];
      scheduled.value = new Set(['a']);
      expect(DownloadButton()).to.not.include('disabled');
    });

    it('carries the analytics tag and an accessible label', () => {
      const out = DownloadButton();
      expect(out).to.include('daa-ll="Download-Schedule"');
      expect(out).to.include('aria-label="Download schedule as .ics calendar file"');
    });
  });

  describe('downloadSchedule', () => {
    it('downloads only the sessions whose id is in the scheduled set', () => {
      const list = [session({ id: 'a' }), session({ id: 'b' }), session({ id: 'c' })];
      downloadSchedule(list, new Set(['a', 'c']));
      expect(clicks).to.have.lengthOf(1);
      expect(clicks[0].download).to.equal('my-sessions.ics');
    });

    it('exports each scheduled session with its own Outlook-visible link and Apple Calendar URL', async () => {
      const list = ['a', 'b', 'c'].map((id) => session({
        id,
        sessionPageUrl: `https://www.adobe.com/max/2026/sessions/${id}`,
      }));
      downloadSchedule(list, new Set(['a', 'c']));

      expect(downloads).to.have.lengthOf(1);
      expect(downloads[0].type).to.equal('text/calendar;charset=utf-8');
      const content = (await downloads[0].text()).replace(/\r\n /g, '');
      const events = content.split('BEGIN:VEVENT\r\n').slice(1);
      expect(events).to.have.lengthOf(2);
      ['a', 'c'].forEach((id, index) => {
        const url = list.find((s) => s.id === id).sessionPageUrl;
        expect(events[index]).to.include(`UID:${id}@sessions.adobe.com\r\n`);
        expect(events[index]).to.include(`DESCRIPTION:Session page: ${url}\r\n`);
        expect(events[index]).to.include(`URL:${url}\r\n`);
        expect(events[index]).to.include('DTSTART:20261028T170000Z\r\n');
        expect(events[index]).to.include('DTEND:20261028T180000Z\r\n');
      });
      expect(content).to.not.include(list[1].sessionPageUrl);
    });

    it('shows an error toast and creates no download when nothing is scheduled', () => {
      downloadSchedule([session({ id: 'a' })], new Set());
      expect(clicks).to.have.lengthOf(0);
      expect(toasts.value[0]?.variant).to.equal('negative');
    });

    it('does not show a toast on a successful download', () => {
      downloadSchedule([session({ id: 'a' })], new Set(['a']));
      expect(toasts.value).to.have.lengthOf(0);
    });
  });
});
