function toIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function foldLine(line: string): string {
  // RFC 5545 : les lignes de plus de 75 octets doivent être repliées.
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75));
    rest = ' ' + rest.slice(75);
  }
  chunks.push(rest);
  return chunks.join('\r\n');
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** Génère un fichier .ics minimal pour un rendez-vous, compatible Google/Apple/Outlook. */
export function generateBookingIcs(options: {
  uid: string;
  title: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nathalie OHL Reflexologue//Booking//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${options.uid}@reflexologie-altkirch.fr`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(options.startsAt)}`,
    `DTEND:${toIcsDate(options.endsAt)}`,
    foldLine(`SUMMARY:${escapeIcsText(options.title)}`),
    foldLine(`DESCRIPTION:${escapeIcsText(options.description)}`),
    foldLine(`LOCATION:${escapeIcsText(options.location)}`),
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}
