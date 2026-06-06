import { Router, Response } from 'express';
import { prisma } from '../db';
import { requireCalDavAuth, CalDavRequest } from '../middlewares/auth';
import { generateIcs, parseIcs } from '../services/ical';
import { create } from 'xmlbuilder2';

const router = Router();

// Apply HTTP Basic Auth to all CalDAV endpoints
router.use(requireCalDavAuth);

// Set CalDAV protocol compliance and CORS headers on all responses
router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PROPFIND, REPORT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Depth, Prefer');
  res.setHeader('Access-Control-Expose-Headers', 'ETag, DAV, WWW-Authenticate');
  res.setHeader('DAV', '1, 2, access-control, calendar-access, calendar-schedule, calendar-auto-schedule');
  res.setHeader('Allow', 'GET, POST, PUT, DELETE, OPTIONS, PROPFIND, REPORT');
  next();
});

// Helper to format Date to standard CalDAV format (e.g., 20260606T070744Z)
function formatCalDavDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

// 1. OPTIONS endpoints - Return DAV headers representing server features
router.options('*', (req, res) => {
  res.status(200).send();
});

// 2. ROOT CALDAV Endpoint - Redirect to User Principal
router.all('/', (req: CalDavRequest, res) => {
  const user = req.user!;
  res.redirect(307, `/caldav/users/${user.username}/`);
});

// 3. USER PRINCIPAL Endpoint - Returns properties of the user account
router.all('/users/:username', async (req: CalDavRequest, res) => {
  const { username } = req.params;
  const authUser = req.user!;

  if (username.toLowerCase() !== authUser.username.toLowerCase()) {
    return res.status(403).send('Forbidden');
  }

  if (req.method === 'PROPFIND') {
    const principalUrl = `/caldav/users/${authUser.username}/`;
    const calendarHomeUrl = `/caldav/users/${authUser.username}/calendars/`;

    // Create XML Response with unprefixed default WebDAV namespace (critical for Apple Calendar!)
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('multistatus', { 
        'xmlns': 'DAV:', 
        'xmlns:C': 'urn:ietf:params:xml:ns:caldav' 
      })
        .ele('response')
          .ele('href').txt(principalUrl).up()
          .ele('propstat')
            .ele('prop')
              .ele('current-user-principal')
                .ele('href').txt(principalUrl).up()
              .up()
              .ele('principal-URL')
                .ele('href').txt(principalUrl).up()
              .up()
              .ele('C:calendar-home-set')
                .ele('href').txt(calendarHomeUrl).up()
              .up()
              .ele('resourcetype')
                .ele('principal').up()
              .up()
              .ele('displayname').txt(authUser.username).up()
              .ele('C:calendar-user-address-set')
                .ele('href').txt(principalUrl).up()
                .ele('href').txt(`mailto:${authUser.username}@localhost`).up()
              .up()
              .ele('supported-report-set')
                .ele('supported-report')
                  .ele('report')
                    .ele('C:calendar-query').up()
                  .up()
                .up()
                .ele('supported-report')
                  .ele('report')
                    .ele('C:calendar-multiget').up()
                  .up()
                .up()
              .up()
            .up()
            .ele('status').txt('HTTP/1.1 200 OK').up()
          .up()
        .up()
      .up();

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(207).send(doc.end({ prettyPrint: true }));
  }

  return res.status(405).send('Method Not Allowed');
});

// 4. CALENDAR HOME Endpoint - Lists all calendars for the user
router.all('/users/:username/calendars', async (req: CalDavRequest, res) => {
  const { username } = req.params;
  const authUser = req.user!;

  if (username.toLowerCase() !== authUser.username.toLowerCase()) {
    return res.status(403).send('Forbidden');
  }

  if (req.method === 'PROPFIND') {
    const homeUrl = `/caldav/users/${authUser.username}/calendars/`;
    const calendars = await prisma.calendar.findMany({
      where: { userId: authUser.id }
    });

    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('multistatus', { 
        'xmlns': 'DAV:', 
        'xmlns:C': 'urn:ietf:params:xml:ns:caldav',
        'xmlns:A': 'http://apple.com/ns/ical/'
      });

    // Node 1: The Collection itself
    doc.ele('response')
      .ele('href').txt(homeUrl).up()
      .ele('propstat')
        .ele('prop')
          .ele('resourcetype')
            .ele('collection').up()
          .up()
        .up()
        .ele('status').txt('HTTP/1.1 200 OK').up()
      .up()
    .up();

    // Nodes for each calendar
    for (const cal of calendars) {
      const calUrl = `/caldav/users/${authUser.username}/calendars/${cal.id}/`;
      
      doc.ele('response')
        .ele('href').txt(calUrl).up()
        .ele('propstat')
          .ele('prop')
            .ele('displayname').txt(cal.name).up()
            .ele('resourcetype')
              .ele('collection').up()
              .ele('C:calendar').up()
            .up()
            .ele('C:supported-calendar-component-set')
              .ele('C:comp', { name: 'VEVENT' }).up()
            .up()
            .ele('A:calendar-color').txt(cal.color).up()
            // getctag is used by CalDAV clients to detect changes on the calendar collection level
            .ele('getctag').txt(`ctag-${cal.syncToken}`).up()
            .ele('C:sync-token').txt(`token-${cal.syncToken}`).up()
          .up()
          .ele('status').txt('HTTP/1.1 200 OK').up()
        .up()
      .up();
    }

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(207).send(doc.end({ prettyPrint: true }));
  }

  return res.status(405).send('Method Not Allowed');
});

// 5. CALENDAR COLLECTION & ITEM Endpoints - Fetching, adding, editing, and deleting events
router.all('/users/:username/calendars/:calendarId*', async (req: CalDavRequest, res) => {
  const { username, calendarId } = req.params;
  const authUser = req.user!;
  
  // Wildcard event ID path parameter extraction
  const subPath = req.params[0]; // e.g. "/event-uid.ics" or empty
  const isItemRequest = subPath && subPath !== '/';
  const eventUidFile = isItemRequest ? subPath.replace('/', '') : '';
  const eventUid = eventUidFile.replace('.ics', '');

  if (username.toLowerCase() !== authUser.username.toLowerCase()) {
    return res.status(403).send('Forbidden');
  }

  // Retrieve calendar
  let calendar = await prisma.calendar.findFirst({
    where: { id: calendarId, userId: authUser.id }
  }).catch(() => null);

  if (!calendar) {
    const decoded = decodeURIComponent(calendarId).replace(/\.ics$/i, '').toLowerCase();
    const cleanName = decoded.replace(/[_-]/g, ' ');

    const allCalendars = await prisma.calendar.findMany({
      where: { userId: authUser.id }
    });

    calendar = allCalendars.find(cal => {
      const calName = cal.name.toLowerCase();
      return calName === decoded || calName === cleanName;
    }) || null;
  }

  if (!calendar) {
    return res.status(404).send('Calendar Not Found');
  }

  const calUrl = `/caldav/users/${authUser.username}/calendars/${calendar.id}/`;

  // --- OPTIONS ---
  if (req.method === 'OPTIONS') {
    return res.status(200).send();
  }

  // --- PROPFIND ---
  if (req.method === 'PROPFIND') {
    const depth = req.headers.depth || '0';
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('multistatus', { 
        'xmlns': 'DAV:', 
        'xmlns:C': 'urn:ietf:params:xml:ns:caldav',
        'xmlns:A': 'http://apple.com/ns/ical/'
      });

    if (!isItemRequest) {
      // PROPFIND on the Calendar Collection itself
      
      // Node 1: The calendar collection metadata
      doc.ele('response')
        .ele('href').txt(calUrl).up()
        .ele('propstat')
          .ele('prop')
            .ele('displayname').txt(calendar.name).up()
            .ele('resourcetype')
              .ele('collection').up()
              .ele('C:calendar').up()
            .up()
            .ele('A:calendar-color').txt(calendar.color).up()
            .ele('getctag').txt(`ctag-${calendar.syncToken}`).up()
            .ele('C:sync-token').txt(`token-${calendar.syncToken}`).up()
          .up()
          .ele('status').txt('HTTP/1.1 200 OK').up()
        .up()
      .up();

      // Node 2+ (Depth 1): Return child items (events)
      if (depth === '1') {
        const events = await prisma.event.findMany({
          where: { calendarId: calendar.id }
        });

        for (const event of events) {
          const itemUrl = `${calUrl}${event.id}.ics`;
          doc.ele('response')
            .ele('href').txt(itemUrl).up()
            .ele('propstat')
              .ele('prop')
                .ele('getetag').txt(event.etag).up()
                .ele('getcontenttype').txt('text/calendar; charset=utf-8').up()
                .ele('resourcetype').up() // empty for files
              .up()
              .ele('status').txt('HTTP/1.1 200 OK').up()
            .up()
          .up();
        }
      }
    } else {
      // PROPFIND on a specific event item
      const event = await prisma.event.findFirst({
        where: {
          calendarId: calendar.id,
          OR: [
            { id: eventUid },
            { uid: eventUid }
          ]
        }
      });

      if (!event) {
        return res.status(404).send('Event Not Found');
      }

      const itemUrl = `${calUrl}${event.id}.ics`;
      doc.ele('response')
        .ele('href').txt(itemUrl).up()
        .ele('propstat')
          .ele('prop')
            .ele('getetag').txt(event.etag).up()
            .ele('getcontenttype').txt('text/calendar; charset=utf-8').up()
            .ele('resourcetype').up()
          .up()
          .ele('status').txt('HTTP/1.1 200 OK').up()
        .up()
      .up();
    }

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(207).send(doc.end({ prettyPrint: true }));
  }

  // --- GET ---
  if (req.method === 'GET') {
    if (isItemRequest) {
      const event = await prisma.event.findFirst({
        where: {
          calendarId: calendar.id,
          OR: [
            { id: eventUid },
            { uid: eventUid }
          ]
        }
      });

      if (!event) {
        return res.status(404).send('Event Not Found');
      }

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('ETag', event.etag);
      return res.status(200).send(generateIcs(event));
    } else {
      // GET request on calendar collection URL: output calendar name or simple diagnostic description
      return res.status(200).send(`CalDAV Calendar Collection: ${calendar.name}`);
    }
  }

  // --- PUT ---
  if (req.method === 'PUT') {
    if (!isItemRequest) {
      return res.status(400).send('Invalid path for event creation.');
    }

    if (calendar.isReadOnly) {
      return res.status(403).send('Calendar is Read-Only');
    }

    const icsContent = req.body;
    if (!icsContent || typeof icsContent !== 'string') {
      return res.status(400).send('Invalid iCalendar payload');
    }

    try {
      const parsed = parseIcs(icsContent);
      const etag = `"${Date.now()}-${Math.random().toString(36).substring(2, 6)}"`;

      // Find existing event by ID (from URL) or UID (from iCalendar body)
      const existingEvent = await prisma.event.findFirst({
        where: {
          calendarId: calendar.id,
          OR: [
            { id: eventUid },
            { uid: parsed.uid }
          ]
        }
      });

      let dbEvent;
      if (existingEvent) {
        dbEvent = await prisma.event.update({
          where: { id: existingEvent.id },
          data: {
            summary: parsed.summary,
            description: parsed.description,
            location: parsed.location,
            dtStart: parsed.dtStart,
            dtEnd: parsed.dtEnd,
            isAllDay: parsed.isAllDay,
            rrule: parsed.rrule,
            sequence: { increment: 1 },
            etag
          }
        });
      } else {
        dbEvent = await prisma.event.create({
          data: {
            id: eventUid.length === 36 ? eventUid : undefined,
            uid: parsed.uid,
            summary: parsed.summary,
            description: parsed.description,
            location: parsed.location,
            dtStart: parsed.dtStart,
            dtEnd: parsed.dtEnd,
            isAllDay: parsed.isAllDay,
            rrule: parsed.rrule,
            etag,
            calendarId: calendar.id
          }
        });
      }

      // Increment syncToken
      await prisma.calendar.update({
        where: { id: calendar.id },
        data: { syncToken: { increment: 1 } }
      });

      res.setHeader('ETag', dbEvent.etag);
      return res.status(201).send();
    } catch (err) {
      console.error('[CalDAV PUT error]', err);
      return res.status(500).send('Error parsing event');
    }
  }

  // --- DELETE ---
  if (req.method === 'DELETE') {
    if (!isItemRequest) {
      return res.status(400).send('Invalid path for event deletion.');
    }

    if (calendar.isReadOnly) {
      return res.status(403).send('Calendar is Read-Only');
    }

    try {
      const event = await prisma.event.findFirst({
        where: {
          calendarId: calendar.id,
          OR: [
            { id: eventUid },
            { uid: eventUid }
          ]
        }
      });

      if (!event) {
        return res.status(404).send('Event Not Found');
      }

      await prisma.event.delete({
        where: { id: event.id }
      });

      // Increment syncToken
      await prisma.calendar.update({
        where: { id: calendar.id },
        data: { syncToken: { increment: 1 } }
      });

      return res.status(204).send();
    } catch (err) {
      console.error('[CalDAV DELETE error]', err);
      return res.status(500).send('Database delete error');
    }
  }

  // --- REPORT ---
  if (req.method === 'REPORT') {
    const bodyText = req.body || '';

    // 1. Parse requested items: either calendar-query (range) or calendar-multiget (specific urls)
    let matchedEvents = [];

    if (bodyText.includes('calendar-multiget')) {
      // Extract specific URLs from XML body
      const hrefRegex = /<[a-zA-Z0-9:]*href[^>]*>([^<]+)<\/[a-zA-Z0-9:]*href>/gi;
      const hrefs: string[] = [];
      let m;
      while ((m = hrefRegex.exec(bodyText)) !== null) {
        hrefs.push(m[1]);
      }

      // Hrefs look like: /caldav/users/admin/calendars/cal-id/event-uid.ics
      const uids = hrefs.map(h => {
        const parts = h.split('/');
        const file = parts[parts.length - 1];
        return file.replace('.ics', '');
      }).filter(Boolean);

      matchedEvents = await prisma.event.findMany({
        where: {
          calendarId: calendar.id,
          OR: [
            { id: { in: uids } },
            { uid: { in: uids } }
          ]
        }
      });
    } else if (bodyText.includes('calendar-query')) {
      // Query events inside a date range
      // e.g. <C:time-range start="20260601T000000Z" end="20260701T000000Z"/>
      const startRegex = /start="([^"]+)"/i;
      const endRegex = /end="([^"]+)"/i;
      
      const startMatch = startRegex.exec(bodyText);
      const endMatch = endRegex.exec(bodyText);

      const parseXmlDate = (dStr: string): Date => {
        const y = parseInt(dStr.substring(0, 4), 10);
        const m = parseInt(dStr.substring(4, 6), 10) - 1;
        const d = parseInt(dStr.substring(6, 8), 10);
        const hh = dStr.includes('T') ? parseInt(dStr.substring(9, 11), 10) : 0;
        const mm = dStr.includes('T') ? parseInt(dStr.substring(11, 13), 10) : 0;
        const ss = dStr.includes('T') ? parseInt(dStr.substring(13, 15), 10) : 0;
        return new Date(Date.UTC(y, m, d, hh, mm, ss));
      };

      const whereClause: any = { calendarId: calendar.id };

      if (startMatch || endMatch) {
        whereClause.OR = [
          {
            rrule: null,
            dtEnd: startMatch ? { gte: parseXmlDate(startMatch[1]) } : undefined,
            dtStart: endMatch ? { lte: parseXmlDate(endMatch[1]) } : undefined
          },
          {
            rrule: { not: null }
          }
        ];
      }

      matchedEvents = await prisma.event.findMany({
        where: whereClause
      });
    } else {
      // Default: return all events
      matchedEvents = await prisma.event.findMany({
        where: { calendarId: calendar.id }
      });
    }

    // Build the XML Multistatus Report Response
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('multistatus', { 
        'xmlns': 'DAV:', 
        'xmlns:C': 'urn:ietf:params:xml:ns:caldav'
      });

    for (const event of matchedEvents) {
      const itemUrl = `${calUrl}${event.id}.ics`;
      const ics = generateIcs(event);

      doc.ele('response')
        .ele('href').txt(itemUrl).up()
        .ele('propstat')
          .ele('prop')
            .ele('getetag').txt(event.etag).up()
            .ele('getcontenttype').txt('text/calendar; charset=utf-8').up()
            .ele('C:calendar-data').txt(ics).up()
          .up()
          .ele('status').txt('HTTP/1.1 200 OK').up()
        .up()
      .up();
    }

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(207).send(doc.end({ prettyPrint: true }));
  }

  return res.status(405).send('Method Not Allowed');
});

export default router;
