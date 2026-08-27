import { expect } from '@esm-bundle/chai';
import { DownloadButton, downloadSchedule } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/DownloadButton.js';
import { sessions, scheduled } from '../../../../../../event-libs/v1/utils/session-store.js';
import { toast } from '../../../../../../event-libs/v1/features/toast/toast.js';

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

  beforeEach(() => {
    sessions.value = [];
    scheduled.value = new Set();
    toast.value = null;
    clicks = [];
    originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function stubClick() {
      clicks.push({ href: this.href, download: this.download });
    };
  });

  afterEach(() => {
    HTMLAnchorElement.prototype.click = originalClick;
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

    it('shows an error toast and creates no download when nothing is scheduled', () => {
      downloadSchedule([session({ id: 'a' })], new Set());
      expect(clicks).to.have.lengthOf(0);
      expect(toast.value?.variant).to.equal('negative');
    });

    it('does not show a toast on a successful download', () => {
      downloadSchedule([session({ id: 'a' })], new Set(['a']));
      expect(toast.value).to.be.null;
    });
  });
});
