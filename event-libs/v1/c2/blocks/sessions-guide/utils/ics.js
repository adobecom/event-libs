function pad(n) {
  return String(n).padStart(2, '0');
}

// null (not a garbage string) for a session with no real time — some real sessions
// (canceled, TBD, overflow-room placeholders) have startTimeUtc/endTimeUtc as '', and
// `new Date('')` is an Invalid Date whose UTC getters all return NaN, which would
// otherwise silently produce a malformed DTSTART/DTEND like "NaNNaNNaNTNaNNaNNaNZ".
function toICSDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

// RFC 5545 §3.3.11: backslash, semicolon, comma and newline are the only characters
// TEXT values must escape. CRLF/lone CR are normalized to LF first so a description
// with Windows-style line endings (or a stray \r) can't leave an unescaped \r in the
// output, which would otherwise be read as a real line break by a strict parser.
function escapeICS(str) {
  return (str || '')
    .replace(/\r\n|\r/g, '\n')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function utf8Length(str) {
  return new TextEncoder().encode(str).length;
}

// RFC 5545 §3.1: lines over 75 *octets* must be folded with CRLF + a single leading
// space, and a fold must never land in the middle of a multi-octet UTF-8 sequence.
// Walking by Unicode code point (not JS string index, which walks UTF-16 code units
// and can split a surrogate pair) and measuring encoded byte length keeps every
// non-ASCII character — accented names, em dashes, curly quotes, emoji — intact.
function foldLine(line) {
  if (utf8Length(line) <= 75) return line;
  const chunks = [];
  let current = '';
  let limit = 75;
  Array.from(line).forEach((ch) => {
    if (utf8Length(current + ch) > limit) {
      chunks.push(current);
      current = '';
      limit = 74;
    }
    current += ch;
  });
  if (current) chunks.push(current);
  return chunks.map((chunk, i) => (i === 0 ? chunk : ` ${chunk}`)).join('\r\n');
}

// A session with no valid start/end can't become a calendar event at all — dropped
// rather than emitting a VEVENT with a corrupt or missing DTSTART/DTEND, which risks
// the whole file being rejected by stricter calendar parsers.
export function generateICS(sessions) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Adobe//Sessions Guide//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  const dtstamp = toICSDate(new Date());
  const dropped = [];

  (sessions || []).forEach((s) => {
    const dtstart = toICSDate(s.startTimeUtc);
    const dtend = toICSDate(s.endTimeUtc);
    if (!dtstart || !dtend) {
      dropped.push(s.id || '(no id)');
      return;
    }

    const speakerNames = s.speakers?.map((sp) => sp.name).filter(Boolean).join(', ') || '';
    const descParts = [s.description, speakerNames ? `Speakers: ${speakerNames}` : ''].filter(Boolean);

    lines.push('BEGIN:VEVENT');
    lines.push(foldLine(`UID:${s.id || crypto.randomUUID()}@sessions.adobe.com`));
    lines.push(foldLine(`DTSTAMP:${dtstamp}`));
    lines.push(foldLine(`DTSTART:${dtstart}`));
    lines.push(foldLine(`DTEND:${dtend}`));
    lines.push(foldLine(`SUMMARY:${escapeICS(s.title)}`));
    if (descParts.length) lines.push(foldLine(`DESCRIPTION:${escapeICS(descParts.join('\n\n'))}`));
    if (s.sessionPageUrl) lines.push(foldLine(`URL:${s.sessionPageUrl}`));
    lines.push('END:VEVENT');
  });

  if (dropped.length) {
    window.lana?.log(`[sessions-guide] ics: dropped ${dropped.length} session(s) with no valid start/end time: ${dropped.join(', ')}`);
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// False (not a thrown error) when there's nothing to download or the browser refuses
// the blob — the caller decides how to surface that instead of an uncaught exception
// breaking the click handler.
export function downloadICS(sessions, filename = 'my-sessions.ics') {
  if (!sessions?.length) return false;
  try {
    const content = generateICS(sessions);
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    window.lana?.log(`[sessions-guide] ics download failed: ${err.message}`);
    return false;
  }
}
