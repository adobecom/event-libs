function pad(n) {
  return String(n).padStart(2, '0');
}

function toICSDate(utcIso) {
  const d = new Date(utcIso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function escapeICS(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// RFC 5545 §3.1: lines > 75 octets must be folded with CRLF + single SPACE
function foldLine(line) {
  if (line.length <= 75) return line;
  const chunks = [];
  let i = 0;
  while (i < line.length) {
    const limit = i === 0 ? 75 : 74;
    chunks.push((i === 0 ? '' : ' ') + line.slice(i, i + limit));
    i += limit;
  }
  return chunks.join('\r\n');
}

export function generateICS(sessions) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Adobe//Sessions Guide//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  sessions.forEach((s) => {
    const speakerNames = s.speakers?.map((sp) => sp.name).join(', ') || '';
    const descParts = [s.description, speakerNames ? `Speakers: ${speakerNames}` : ''].filter(Boolean);
    lines.push('BEGIN:VEVENT');
    lines.push(foldLine(`UID:${s.id}@sessions.adobe.com`));
    lines.push(foldLine(`DTSTART:${toICSDate(s.startTimeUtc)}`));
    lines.push(foldLine(`DTEND:${toICSDate(s.endTimeUtc)}`));
    lines.push(foldLine(`SUMMARY:${escapeICS(s.title)}`));
    lines.push(foldLine(`DESCRIPTION:${escapeICS(descParts.join('\n\n'))}`));
    if (s.sessionPageUrl) lines.push(foldLine(`URL:${s.sessionPageUrl}`));
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS(sessions, filename = 'my-sessions.ics') {
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
}
