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

export interface IcalParsedTodo {
  uid: string;
  summary: string;
  description: string | null;
  status: string; // "NEEDS-ACTION" | "COMPLETED" | "CANCELLED"
  completedAt: Date | null;
  due: Date | null;
  dtStart: Date | null;
  priority: number; // 0-9
  sequence: number;
}

// Helper to compute local time components in a given timezone from a UTC Date
export function utcToLocal(date: Date, tz: string): { y: number; m: number; d: number; hh: number; mm: number; ss: number } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const getVal = (type: string) => {
      const p = parts.find(x => x.type === type);
      return p ? parseInt(p.value, 10) : 0;
    };
    
    const y = getVal('year');
    const m = getVal('month');
    const d = getVal('day');
    let hh = getVal('hour');
    if (hh === 24) hh = 0;
    const mm = getVal('minute');
    const ss = getVal('second');
    
    return { y, m, d, hh, mm, ss };
  } catch (err) {
    console.error(`Error formatting utcToLocal for timezone ${tz}:`, err);
    // Fallback to UTC components
    return {
      y: date.getUTCFullYear(),
      m: date.getUTCMonth() + 1,
      d: date.getUTCDate(),
      hh: date.getUTCHours(),
      mm: date.getUTCMinutes(),
      ss: date.getUTCSeconds()
    };
  }
}

// Helper to compute timezone offset in minutes for a specific timezone at a given UTC Date
export function getTimezoneOffset(tz: string, date: Date): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const getVal = (type: string) => {
      const p = parts.find(x => x.type === type);
      return p ? parseInt(p.value, 10) : 0;
    };
    
    const year = getVal('year');
    const month = getVal('month') - 1;
    const day = getVal('day');
    let hour = getVal('hour');
    if (hour === 24) hour = 0;
    const minute = getVal('minute');
    const second = getVal('second');
    
    const localTime = Date.UTC(year, month, day, hour, minute, second);
    const utcTime = date.getTime();
    return (localTime - utcTime) / 60000;
  } catch (err) {
    // Fallback parsing of offset format like GMT+03:00 or +03:00
    const offsetMatch = tz.match(/([+-])(\d{1,2}):?(\d{2})?/);
    if (offsetMatch) {
      const sign = offsetMatch[1] === '+' ? 1 : -1;
      const hours = parseInt(offsetMatch[2], 10);
      const mins = offsetMatch[3] ? parseInt(offsetMatch[3], 10) : 0;
      return sign * (hours * 60 + mins);
    }
    console.error(`Error calculating timezone offset for ${tz}:`, err);
    return 0; // Fall back to UTC
  }
}

// Convert local date-time components in a given timezone to a UTC Date
export function localToUtc(y: number, m: number, d: number, hh: number, mm: number, ss: number, tz: string): Date {
  const guessUtc = Date.UTC(y, m, d, hh, mm, ss);
  let offset = getTimezoneOffset(tz, new Date(guessUtc));
  let finalUtc = guessUtc - offset * 60000;
  
  // Refine offset (needed for DST transition edge cases)
  let offsetRefined = getTimezoneOffset(tz, new Date(finalUtc));
  if (offset !== offsetRefined) {
    finalUtc = guessUtc - offsetRefined * 60000;
  }
  return new Date(finalUtc);
}

// Generates a standard-compliant VTIMEZONE block for an IANA timezone
export function generateVtimezone(tz: string): string {
  try {
    const jan = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
    const jul = new Date(Date.UTC(2026, 6, 1, 0, 0, 0));
    
    const janOffsetMins = getTimezoneOffset(tz, jan);
    const julOffsetMins = getTimezoneOffset(tz, jul);
    
    const formatOffset = (mins: number) => {
      const sign = mins >= 0 ? '+' : '-';
      const absMins = Math.abs(mins);
      const h = String(Math.floor(absMins / 60)).padStart(2, '0');
      const m = String(absMins % 60).padStart(2, '0');
      return `${sign}${h}${m}`;
    };
    
    const stdOffsetStr = formatOffset(janOffsetMins);
    const dstOffsetStr = formatOffset(julOffsetMins);
    
    if (janOffsetMins === julOffsetMins) {
      return [
        'BEGIN:VTIMEZONE',
        `TZID:${tz}`,
        'BEGIN:STANDARD',
        'DTSTART:19700101T000000',
        `TZOFFSETFROM:${stdOffsetStr}`,
        `TZOFFSETTO:${stdOffsetStr}`,
        'TZNAME:GMT',
        'END:STANDARD',
        'END:VTIMEZONE'
      ].join('\r\n');
    }
    
    const isNorthern = julOffsetMins > janOffsetMins;
    const stdOffset = isNorthern ? janOffsetMins : julOffsetMins;
    const dstOffset = isNorthern ? julOffsetMins : janOffsetMins;
    
    const stdOffsetFmt = formatOffset(stdOffset);
    const dstOffsetFmt = formatOffset(dstOffset);
    
    const isUS = tz.startsWith('America/') || tz.startsWith('US/');
    
    let dstStartRule = 'FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU'; // EU default: last Sunday in March
    let stdStartRule = 'FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU'; // EU default: last Sunday in October
    let dstStartMonthDay = '0329T030000';
    let stdStartMonthDay = '1025T040000';
    
    if (isUS) {
      dstStartRule = 'FREQ=YEARLY;BYMONTH=3;BYDAY=2SU'; // US: second Sunday in March
      stdStartRule = 'FREQ=YEARLY;BYMONTH=11;BYDAY=1SU'; // US: first Sunday in November
      dstStartMonthDay = '0308T020000';
      stdStartMonthDay = '1101T020000';
    }
    
    if (!isNorthern) {
      dstStartRule = 'FREQ=YEARLY;BYMONTH=10;BYDAY=1SU'; // Australia default
      stdStartRule = 'FREQ=YEARLY;BYMONTH=4;BYDAY=1SU';
      dstStartMonthDay = '1005T020000';
      stdStartMonthDay = '0405T030000';
    }
    
    return [
      'BEGIN:VTIMEZONE',
      `TZID:${tz}`,
      'BEGIN:STANDARD',
      `TZNAME:${isNorthern ? 'EET' : 'AEDT'}`,
      `TZOFFSETFROM:${dstOffsetFmt}`,
      `TZOFFSETTO:${stdOffsetFmt}`,
      `DTSTART:1970${stdStartMonthDay}`,
      `RRULE:${stdStartRule}`,
      'END:STANDARD',
      'BEGIN:DAYLIGHT',
      `TZNAME:${isNorthern ? 'EEST' : 'AEST'}`,
      `TZOFFSETFROM:${stdOffsetFmt}`,
      `TZOFFSETTO:${dstOffsetFmt}`,
      `DTSTART:1970${dstStartMonthDay}`,
      `RRULE:${dstStartRule}`,
      'END:DAYLIGHT',
      'END:VTIMEZONE'
    ].join('\r\n');
  } catch (err) {
    console.error(`Error generating VTIMEZONE block for ${tz}:`, err);
    return [
      'BEGIN:VTIMEZONE',
      `TZID:${tz}`,
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      'TZOFFSETFROM:+0200',
      'TZOFFSETTO:+0200',
      'TZNAME:GMT',
      'END:STANDARD',
      'END:VTIMEZONE'
    ].join('\r\n');
  }
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
  const tz = process.env.APP_TIMEZONE || 'Europe/Bucharest';

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

  const formatIcalLocal = (date: Date) => {
    const { y, m, d, hh, mm, ss } = utcToLocal(date, tz);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}${pad(ss)}`;
  };

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CalBridge//NONSGML v1.0//EN',
  ];

  if (!event.isAllDay) {
    lines.push(generateVtimezone(tz));
  }

  lines.push(
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence || 0}`,
    `DTSTAMP:${formatIcalDate(new Date(), false)}`,
  );

  if (event.isAllDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatIcalDate(new Date(event.dtStart), true)}`);
    lines.push(`DTEND;VALUE=DATE:${formatIcalDate(new Date(event.dtEnd), true)}`);
  } else {
    lines.push(`DTSTART;TZID=${tz}:${formatIcalLocal(new Date(event.dtStart))}`);
    lines.push(`DTEND;TZID=${tz}:${formatIcalLocal(new Date(event.dtEnd))}`);
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
  const tz = process.env.APP_TIMEZONE || 'Europe/Bucharest';

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

  const formatIcalLocal = (date: Date) => {
    const { y, m, d, hh, mm, ss } = utcToLocal(date, tz);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}${pad(ss)}`;
  };

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CalBridge//NONSGML v1.0//EN',
    `X-WR-CALNAME:${calendarName}`,
  ];

  const hasTimedEvents = events.some(e => !e.isAllDay);
  if (hasTimedEvents) {
    lines.push(generateVtimezone(tz));
  }

  for (const event of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.uid}`);
    lines.push(`SEQUENCE:${event.sequence || 0}`);
    lines.push(`DTSTAMP:${formatIcalDate(new Date(), false)}`);
    
    if (event.isAllDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatIcalDate(new Date(event.dtStart), true)}`);
      lines.push(`DTEND;VALUE=DATE:${formatIcalDate(new Date(event.dtEnd), true)}`);
    } else {
      lines.push(`DTSTART;TZID=${tz}:${formatIcalLocal(new Date(event.dtStart))}`);
      lines.push(`DTEND;TZID=${tz}:${formatIcalLocal(new Date(event.dtEnd))}`);
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

  const parseIcalDate = (val: string, tzid: string | null): { date: Date; isAllDay: boolean } => {
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
    const timePart = parts[1];

    const y = parseInt(datePart.substring(0, 4), 10);
    const m = parseInt(datePart.substring(4, 6), 10) - 1;
    const d = parseInt(datePart.substring(6, 8), 10);

    const hh = parseInt(timePart.substring(0, 2), 10);
    const mm = parseInt(timePart.substring(2, 4), 10);
    const ss = parseInt(timePart.substring(4, 6), 10);

    if (timePart.endsWith('Z')) {
      return { date: new Date(Date.UTC(y, m, d, hh, mm, ss)), isAllDay: false };
    }

    const tz = tzid || process.env.APP_TIMEZONE || 'Europe/Bucharest';
    const date = localToUtc(y, m, d, hh, mm, ss, tz);
    return { date, isAllDay: false };
  };

  const unescapeText = (text: string): string => {
    return text
      .replace(/\\n/gi, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  };

  let inVevent = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.toUpperCase() === 'BEGIN:VEVENT') {
      inVevent = true;
      continue;
    }
    if (trimmed.toUpperCase() === 'END:VEVENT') {
      inVevent = false;
      continue;
    }

    if (!inVevent) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const keyWithParams = line.substring(0, colonIdx);
    const value = line.substring(colonIdx + 1);
    const key = keyWithParams.split(';')[0].trim().toUpperCase();

    // Parse TZID parameter if present
    let tzid: string | null = null;
    const params = keyWithParams.split(';');
    for (const param of params) {
      const [pKey, pVal] = param.split('=');
      if (pKey && pVal && pKey.trim().toUpperCase() === 'TZID') {
        tzid = pVal.trim().replace(/^"|"$/g, '');
      }
    }

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
        const startInfo = parseIcalDate(value, tzid);
        dtStart = startInfo.date;
        isAllDay = startInfo.isAllDay || keyWithParams.toUpperCase().includes('VALUE=DATE');
        break;
      case 'DTEND':
        const endInfo = parseIcalDate(value, tzid);
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

// Convert a Todo DB model to a standard VTODO .ics file representation
export function generateTodoIcs(todo: {
  uid: string;
  summary: string;
  description: string | null;
  status: string;
  completedAt: Date | null;
  due: Date | null;
  dtStart: Date | null;
  priority: number;
  sequence: number;
}): string {
  const formatIcalDate = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const y = date.getUTCFullYear();
    const m = pad(date.getUTCMonth() + 1);
    const d = pad(date.getUTCDate());
    const hh = pad(date.getUTCHours());
    const mm = pad(date.getUTCMinutes());
    const ss = pad(date.getUTCSeconds());
    return `${y}${m}${d}T${hh}${mm}${ss}Z`;
  };

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CalBridge//NONSGML v1.0//EN',
    'BEGIN:VTODO',
    `UID:${todo.uid}`,
    `SEQUENCE:${todo.sequence || 0}`,
    `DTSTAMP:${formatIcalDate(new Date())}`,
  ];

  lines.push(`SUMMARY:${todo.summary || 'Untitled Reminder'}`);

  if (todo.description) {
    const escapedDesc = todo.description
      .replace(/\\/g, '\\\\')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;')
      .replace(/\n/g, '\\n');
    lines.push(`DESCRIPTION:${escapedDesc}`);
  }

  if (todo.status) {
    lines.push(`STATUS:${todo.status}`);
  }

  if (todo.completedAt) {
    lines.push(`COMPLETED:${formatIcalDate(new Date(todo.completedAt))}`);
  }

  if (todo.due) {
    lines.push(`DUE:${formatIcalDate(new Date(todo.due))}`);
  }

  if (todo.dtStart) {
    lines.push(`DTSTART:${formatIcalDate(new Date(todo.dtStart))}`);
  }

  if (todo.priority !== undefined) {
    lines.push(`PRIORITY:${todo.priority}`);
  }

  lines.push('END:VTODO');
  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

// Parse an incoming VTODO .ics file content
export function parseTodoIcs(icsText: string): IcalParsedTodo {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  let uid = '';
  let summary = '';
  let description = '';
  let status = 'NEEDS-ACTION';
  let completedAt: Date | null = null;
  let due: Date | null = null;
  let dtStart: Date | null = null;
  let priority = 0;
  let sequence = 0;

  const parseIcalDate = (val: string, tzid: string | null): Date => {
    const cleanVal = val.trim();
    if (!cleanVal.includes('T')) {
      const y = parseInt(cleanVal.substring(0, 4), 10);
      const m = parseInt(cleanVal.substring(4, 6), 10) - 1;
      const d = parseInt(cleanVal.substring(6, 8), 10);
      return new Date(Date.UTC(y, m, d, 0, 0, 0));
    }
    const parts = cleanVal.split('T');
    const datePart = parts[0];
    const timePart = parts[1];

    const y = parseInt(datePart.substring(0, 4), 10);
    const m = parseInt(datePart.substring(4, 6), 10) - 1;
    const d = parseInt(datePart.substring(6, 8), 10);

    const hh = parseInt(timePart.substring(0, 2), 10);
    const mm = parseInt(timePart.substring(2, 4), 10);
    const ss = parseInt(timePart.substring(4, 6), 10);

    if (timePart.endsWith('Z')) {
      return new Date(Date.UTC(y, m, d, hh, mm, ss));
    }

    const tz = tzid || process.env.APP_TIMEZONE || 'Europe/Bucharest';
    return localToUtc(y, m, d, hh, mm, ss, tz);
  };

  const unescapeText = (text: string): string => {
    return text
      .replace(/\\n/gi, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  };

  let inVtodo = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.toUpperCase() === 'BEGIN:VTODO') {
      inVtodo = true;
      continue;
    }
    if (trimmed.toUpperCase() === 'END:VTODO') {
      inVtodo = false;
      continue;
    }

    if (!inVtodo) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const keyWithParams = line.substring(0, colonIdx);
    const value = line.substring(colonIdx + 1);
    const key = keyWithParams.split(';')[0].trim().toUpperCase();

    // Parse TZID parameter if present
    let tzid: string | null = null;
    const params = keyWithParams.split(';');
    for (const param of params) {
      const [pKey, pVal] = param.split('=');
      if (pKey && pVal && pKey.trim().toUpperCase() === 'TZID') {
        tzid = pVal.trim().replace(/^"|"$/g, '');
      }
    }

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
      case 'STATUS':
        status = value.trim().toUpperCase();
        break;
      case 'COMPLETED':
        completedAt = parseIcalDate(value, null);
        break;
      case 'DUE':
        due = parseIcalDate(value, tzid);
        break;
      case 'DTSTART':
        dtStart = parseIcalDate(value, tzid);
        break;
      case 'PRIORITY':
        priority = parseInt(value, 10) || 0;
        break;
      case 'SEQUENCE':
        sequence = parseInt(value, 10) || 0;
        break;
    }
  }

  return {
    uid: uid || `cb-todo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    summary: summary || 'Untitled Reminder',
    description: description || null,
    status,
    completedAt,
    due,
    dtStart,
    priority,
    sequence
  };
}
