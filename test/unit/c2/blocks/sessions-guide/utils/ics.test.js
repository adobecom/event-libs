import { expect } from '@esm-bundle/chai';
import { generateICS, downloadICS } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/utils/ics.js';

function session(overrides = {}) {
  return {
    id: 's-1',
    title: 'A Session',
    description: 'A description.',
    startTimeUtc: '2026-10-28T17:00:00.000Z',
    endTimeUtc: '2026-10-28T18:00:00.000Z',
    speakers: [],
    sessionPageUrl: '',
    ...overrides,
  };
}

// Reverses RFC 5545 §3.1 line folding (CRLF + a single leading space) so property
// values can be asserted against without the test itself reimplementing fold math.
function unfold(ics) {
  return ics.split('\r\n').reduce((lines, line) => {
    if (line.startsWith(' ') && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
    return lines;
  }, []);
}

function getProp(lines, name) {
  const line = lines.find((l) => l.startsWith(`${name}:`));
  return line ? line.slice(name.length + 1) : undefined;
}

describe('sessions-guide/utils/ics', () => {
  describe('generateICS', () => {
    it('wraps sessions in a valid VCALENDAR/VEVENT structure', () => {
      const lines = unfold(generateICS([session()]));
      expect(lines[0]).to.equal('BEGIN:VCALENDAR');
      expect(lines).to.include('VERSION:2.0');
      expect(lines).to.include('BEGIN:VEVENT');
      expect(lines).to.include('END:VEVENT');
      expect(lines[lines.length - 1]).to.equal('END:VCALENDAR');
    });

    it('includes a DTSTAMP on every event (RFC 5545 §3.6.1 requires it)', () => {
      const dtstamp = getProp(unfold(generateICS([session()])), 'DTSTAMP');
      expect(dtstamp).to.match(/^\d{8}T\d{6}Z$/);
    });

    it('formats DTSTART/DTEND as UTC basic-format date-times', () => {
      const lines = unfold(generateICS([session()]));
      expect(getProp(lines, 'DTSTART')).to.equal('20261028T170000Z');
      expect(getProp(lines, 'DTEND')).to.equal('20261028T180000Z');
    });

    it('includes speaker names appended to the description', () => {
      const lines = unfold(generateICS([session({
        description: 'About the talk.',
        speakers: [{ name: 'Ada Lovelace' }, { name: 'Grace Hopper' }],
      })]));
      // The joining comma is itself inside the TEXT value, so it's escaped too.
      expect(getProp(lines, 'DESCRIPTION')).to.equal('About the talk.\\n\\nSpeakers: Ada Lovelace\\, Grace Hopper');
    });

    it('omits DESCRIPTION entirely when there is no description or speakers', () => {
      const lines = unfold(generateICS([session({ description: '', speakers: [] })]));
      expect(lines.some((l) => l.startsWith('DESCRIPTION'))).to.be.false;
    });

    it('omits URL when sessionPageUrl is empty, includes it when set', () => {
      const withoutUrl = unfold(generateICS([session({ sessionPageUrl: '' })]));
      expect(withoutUrl.some((l) => l.startsWith('URL:'))).to.be.false;

      const withUrl = unfold(generateICS([session({ sessionPageUrl: '/sessions/foo' })]));
      expect(getProp(withUrl, 'URL')).to.equal('/sessions/foo');
    });

    it('escapes backslash, semicolon, comma, and newline in TEXT values', () => {
      const lines = unfold(generateICS([session({
        title: 'Weird; Title, With\\Backslash',
        description: 'Line one\nLine two',
      })]));
      expect(getProp(lines, 'SUMMARY')).to.equal('Weird\\; Title\\, With\\\\Backslash');
      expect(getProp(lines, 'DESCRIPTION')).to.equal('Line one\\nLine two');
    });

    it('normalizes CRLF and lone CR in descriptions to the same escaped \\n', () => {
      const crlf = unfold(generateICS([session({ id: 'a', description: 'One\r\nTwo' })]));
      const cr = unfold(generateICS([session({ id: 'b', description: 'One\rTwo' })]));
      expect(getProp(crlf, 'DESCRIPTION')).to.equal('One\\nTwo');
      expect(getProp(cr, 'DESCRIPTION')).to.equal('One\\nTwo');
    });

    it('drops a session with no valid start/end time instead of emitting a corrupt DTSTART', () => {
      const ics = generateICS([
        session({ id: 'bad', startTimeUtc: '', endTimeUtc: '' }),
        session({ id: 'good' }),
      ]);
      const uids = unfold(ics).filter((l) => l.startsWith('UID:'));
      expect(uids).to.have.lengthOf(1);
      expect(uids[0]).to.include('good');
      expect(ics).to.not.include('NaN');
    });

    it('falls back to a random UID when the session has no id', () => {
      const uid = getProp(unfold(generateICS([session({ id: '' })])), 'UID');
      expect(uid).to.match(/^[0-9a-f-]{36}@sessions\.adobe\.com$/);
    });

    it('folds a long line at 75 octets without splitting a multi-byte UTF-8 character', () => {
      // 'é' is 2 bytes in UTF-8 — a naive char-count fold could split its bytes across lines.
      const longTitle = `${'é'.repeat(40)}tail`;
      const ics = generateICS([session({ title: longTitle })]);
      const physicalLines = ics.split('\r\n');
      const summaryStart = physicalLines.findIndex((l) => l.startsWith('SUMMARY:'));
      expect(summaryStart).to.be.at.least(0);
      const encoder = new TextEncoder();
      expect(encoder.encode(physicalLines[summaryStart]).length).to.be.at.most(75);
      // Re-joining the fold must reproduce the exact original title, proving no
      // multi-byte character was corrupted by the split.
      expect(getProp(unfold(ics), 'SUMMARY')).to.equal(longTitle);
    });

    it('handles an empty session list', () => {
      expect(generateICS([])).to.equal(
        'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Adobe//Sessions Guide//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nEND:VCALENDAR',
      );
    });
  });

  describe('downloadICS', () => {
    let clicks;
    let originalClick;

    beforeEach(() => {
      clicks = [];
      originalClick = HTMLAnchorElement.prototype.click;
      // The real .click() would trigger an actual file download in the test browser —
      // stub it to record the anchor's attributes instead.
      HTMLAnchorElement.prototype.click = function stubClick() {
        clicks.push({ href: this.href, download: this.download });
      };
    });

    afterEach(() => {
      HTMLAnchorElement.prototype.click = originalClick;
    });

    it('returns false and creates no download for an empty or missing list', () => {
      expect(downloadICS([])).to.be.false;
      expect(downloadICS(undefined)).to.be.false;
      expect(clicks).to.have.lengthOf(0);
    });

    it('triggers a single blob download named with the given filename', () => {
      expect(downloadICS([session()], 'custom.ics')).to.be.true;
      expect(clicks).to.have.lengthOf(1);
      expect(clicks[0].download).to.equal('custom.ics');
      expect(clicks[0].href).to.match(/^blob:/);
    });

    it('defaults the filename to my-sessions.ics', () => {
      downloadICS([session()]);
      expect(clicks[0].download).to.equal('my-sessions.ics');
    });
  });
});
