export interface IcalParsedEvent {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  dtStart: Date;
  dtEnd: Date;
  isAllDay: boolean;
  rrule: string | null;
  sequence: number;
}

// Convert a DB event to a standard single-event .ics file
export function generateIcs(event: {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  dtStart: Date;
  dtEnd: Date;
  isAllDay: boolean;
  rrule: string | null;
  sequence: number;
}): string {
  const formatIcalDate = (date: Date, isAllDay: boolean) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const y = date.getUTCFullYear();
    const m = pad(date.getUTCMonth() + 1);
    const d = pad(date.getUTCDate());
    if (isAllDay) {
      return `${y}${m}${d}`;
    }
    const hh = pad(date.getUTCHours());
    const mm = pad(date.getUTCMinutes());
    const ss = pad(date.getUTCSeconds());
    return `${y}${m}${d}T${hh}${mm}${ss}Z`;
  };

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CalBridge//NONSGML v1.0//EN',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence || 0}`,
    `DTSTAMP:${formatIcalDate(new Date(), false)}`,
  ];

  if (event.isAllDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatIcalDate(new Date(event.dtStart), true)}`);
    lines.push(`DTEND;VALUE=DATE:${formatIcalDate(new Date(event.dtEnd), true)}`);
  } else {
    lines.push(`DTSTART:${formatIcalDate(new Date(event.dtStart), false)}`);
    lines.push(`DTEND:${formatIcalDate(new Date(event.dtEnd), false)}`);
  }

  lines.push(`SUMMARY:${event.summary || 'Untitled Event'}`);
  
  if (event.description) {
    const escapedDesc = event.description
      .replace(/\\/g, '\\\\')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;')
      .replace(/\n/g, '\\n');
    lines.push(`DESCRIPTION:${escapedDesc}`);
  }
  
  if (event.location) {
    const escapedLoc = event.location
      .replace(/\\/g, '\\\\')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;')
      .replace(/\n/g, '\\n');
    lines.push(`LOCATION:${escapedLoc}`);
  }
  
  if (event.rrule) {
    lines.push(`RRULE:${event.rrule}`);
  }

  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

// Convert a list of events into a multi-event .ics calendar collection
export function generateCalendarIcs(calendarName: string, events: Array<{
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  dtStart: Date;
  dtEnd: Date;
  isAllDay: boolean;
  rrule: string | null;
  sequence: number;
}>): string {
  const formatIcalDate = (date: Date, isAllDay: boolean) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const y = date.getUTCFullYear();
    const m = pad(date.getUTCMonth() + 1);
    const d = pad(date.getUTCDate());
    if (isAllDay) {
      return `${y}${m}${d}`;
    }
    const hh = pad(date.getUTCHours());
    const mm = pad(date.getUTCMinutes());
    const ss = pad(date.getUTCSeconds());
    return `${y}${m}${d}T${hh}${mm}${ss}Z`;
  };

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CalBridge//NONSGML v1.0//EN',
    `X-WR-CALNAME:${calendarName}`,
  ];

  for (const event of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.uid}`);
    lines.push(`SEQUENCE:${event.sequence || 0}`);
    lines.push(`DTSTAMP:${formatIcalDate(new Date(), false)}`);
    
    if (event.isAllDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatIcalDate(new Date(event.dtStart), true)}`);
      lines.push(`DTEND;VALUE=DATE:${formatIcalDate(new Date(event.dtEnd), true)}`);
    } else {
      lines.push(`DTSTART:${formatIcalDate(new Date(event.dtStart), false)}`);
      lines.push(`DTEND:${formatIcalDate(new Date(event.dtEnd), false)}`);
    }

    lines.push(`SUMMARY:${event.summary || 'Untitled Event'}`);
    
    if (event.description) {
      const escapedDesc = event.description
        .replace(/\\/g, '\\\\')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;')
        .replace(/\n/g, '\\n');
      lines.push(`DESCRIPTION:${escapedDesc}`);
    }
    
    if (event.location) {
      const escapedLoc = event.location
        .replace(/\\/g, '\\\\')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;')
        .replace(/\n/g, '\\n');
      lines.push(`LOCATION:${escapedLoc}`);
    }
    
    if (event.rrule) {
      lines.push(`RRULE:${event.rrule}`);
    }
    
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// Parse an incoming .ics text file content
export function parseIcs(icsText: string): IcalParsedEvent {
  // Unfold lines (replace newline followed by tab/space with empty string)
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  let uid = '';
  let summary = '';
  let description = '';
  let location = '';
  let dtStart: Date | null = null;
  let dtEnd: Date | null = null;
  let isAllDay = false;
  let rrule = '';
  let sequence = 0;

  const parseIcalDate = (val: string): { date: Date; isAllDay: boolean } => {
    const cleanVal = val.trim();
    if (!cleanVal.includes('T')) {
      // All Day: YYYYMMDD
      const y = parseInt(cleanVal.substring(0, 4), 10);
      const m = parseInt(cleanVal.substring(4, 6), 10) - 1;
      const d = parseInt(cleanVal.substring(6, 8), 10);
      return { date: new Date(Date.UTC(y, m, d, 0, 0, 0)), isAllDay: true };
    }
    
    // DateTime: YYYYMMDDTHHMMSS (optionally with Z)
    const parts = cleanVal.split('T');
    const datePart = parts[0];
    const timePart = parts[1].replace('Z', '');

    const y = parseInt(datePart.substring(0, 4), 10);
    const m = parseInt(datePart.substring(4, 6), 10) - 1;
    const d = parseInt(datePart.substring(6, 8), 10);

    const hh = parseInt(timePart.substring(0, 2), 10);
    const mm = parseInt(timePart.substring(2, 4), 10);
    const ss = parseInt(timePart.substring(4, 6), 10);

    return { date: new Date(Date.UTC(y, m, d, hh, mm, ss)), isAllDay: false };
  };

  const unescapeText = (text: string): string => {
    return text
      .replace(/\\n/gi, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  };

  for (const line of lines) {
    if (!line.trim()) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const keyWithParams = line.substring(0, colonIdx);
    const value = line.substring(colonIdx + 1);
    const key = keyWithParams.split(';')[0].trim().toUpperCase();

    switch (key) {
      case 'UID':
        uid = value.trim();
        break;
      case 'SUMMARY':
        summary = unescapeText(value);
        break;
      case 'DESCRIPTION':
        description = unescapeText(value);
        break;
      case 'LOCATION':
        location = unescapeText(value);
        break;
      case 'DTSTART':
        const startInfo = parseIcalDate(value);
        dtStart = startInfo.date;
        isAllDay = startInfo.isAllDay || keyWithParams.toUpperCase().includes('VALUE=DATE');
        break;
      case 'DTEND':
        const endInfo = parseIcalDate(value);
        dtEnd = endInfo.date;
        break;
      case 'RRULE':
        rrule = value.trim();
        break;
      case 'SEQUENCE':
        sequence = parseInt(value, 10) || 0;
        break;
    }
  }

  if (dtStart && !dtEnd) {
    dtEnd = new Date(dtStart.getTime());
    if (isAllDay) {
      dtEnd.setUTCDate(dtEnd.getUTCDate() + 1);
    } else {
      dtEnd.setUTCHours(dtEnd.getUTCHours() + 1);
    }
  }

  return {
    uid: uid || `cb-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    summary: summary || 'Untitled Event',
    description: description || null,
    location: location || null,
    dtStart: dtStart || new Date(),
    dtEnd: dtEnd || new Date(),
    isAllDay,
    rrule: rrule || null,
    sequence
  };
}

// Parse multiple events in a full calendar ICS payload
export function parseCalendarIcs(icsText: string): IcalParsedEvent[] {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const events: IcalParsedEvent[] = [];
  
  // Extract all VEVENT blocks using a global regex
  const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi;
  let match;
  
  while ((match = veventRegex.exec(unfolded)) !== null) {
    const eventBody = match[0];
    try {
      const parsed = parseIcs(eventBody);
      events.push(parsed);
    } catch (err) {
      console.error('[ICS Service] Failed parsing event block:', err);
    }
  }
  
  return events;
}
