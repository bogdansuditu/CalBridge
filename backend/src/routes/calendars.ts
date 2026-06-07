import { Router, Response } from 'express';
import { prisma } from '../db';
import { requireWebAuth, WebRequest } from '../middlewares/auth';
import { syncCalendar } from '../services/sync';
import { parseCalendarIcs, generateCalendarIcs } from '../services/ical';

const router = Router();

// GET /api/calendars/feed/:id - Public/Token subscription feed (.ics format)
// GET /api/calendars/feed/:id - Public/Token subscription feed (.ics format)
router.get('/feed/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Strictly find by UUID directly (catch database error if id is not a valid UUID string format)
    const calendar = await prisma.calendar.findUnique({
      where: { id },
      include: {
        events: {
          orderBy: { dtStart: 'asc' }
        }
      }
    }).catch(() => null);

    if (!calendar) {
      return res.status(404).send('Calendar not found');
    }

    const icsContent = generateCalendarIcs(calendar.name, calendar.events);
    
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${calendar.name.replace(/[^a-zA-Z0-9]/g, '_')}.ics"`);
    return res.status(200).send(icsContent);
  } catch (error) {
    console.error('[Calendars Feed Route] Error:', error);
    return res.status(500).send('Internal Server Error');
  }
});

// Apply requireWebAuth middleware to all endpoints in this file
router.use(requireWebAuth);

// GET /api/calendars - Get all calendars for the user
router.get('/', async (req: WebRequest, res: Response) => {
  const userId = req.user?.userId;
  try {
    const calendars = await prisma.calendar.findMany({
      where: { userId },
      include: {
        _count: {
          select: { events: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json({ calendars });
  } catch (error) {
    console.error('[Calendars Route] List error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/calendars - Create a new calendar (local or subscription)
router.post('/', async (req: WebRequest, res: Response) => {
  const userId = req.user?.userId;
  const { name, color, isReadOnly, feedUrl } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Bad Request', message: 'Calendar name is required' });
  }

  try {
    const calendar = await prisma.calendar.create({
      data: {
        name,
        color: color || '#3b82f6',
        isReadOnly: !!isReadOnly,
        feedUrl: isReadOnly ? feedUrl : null,
        userId: userId!
      }
    });

    // If it's a subscription feed, run initial sync in background
    if (calendar.isReadOnly && calendar.feedUrl) {
      syncCalendar(calendar.id).catch(err => {
        console.error(`[Sync] Initial sync failed for calendar ${calendar.id}:`, err);
      });
    }

    res.status(201).json({ calendar });
  } catch (error) {
    console.error('[Calendars Route] Create error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PUT /api/calendars/:id - Update calendar config
router.put('/:id', async (req: WebRequest, res: Response) => {
  const userId = req.user?.userId;
  const { id } = req.params;
  const { name, color, feedUrl } = req.body;

  try {
    const calendar = await prisma.calendar.findFirst({
      where: { id, userId }
    });

    if (!calendar) {
      return res.status(404).json({ error: 'Not Found', message: 'Calendar not found' });
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (color) updateData.color = color;
    if (feedUrl && calendar.isReadOnly) {
      updateData.feedUrl = feedUrl;
    }

    const updated = await prisma.calendar.update({
      where: { id },
      data: {
        ...updateData,
        syncToken: { increment: 1 } // Increment syncToken as configuration changed
      }
    });

    // If feedUrl changed, sync again
    if (feedUrl && calendar.isReadOnly && feedUrl !== calendar.feedUrl) {
      syncCalendar(updated.id).catch(err => {
        console.error(`[Sync] Sync failed after URL update for calendar ${updated.id}:`, err);
      });
    }

    res.json({ calendar: updated });
  } catch (error) {
    console.error('[Calendars Route] Update error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/calendars/:id - Delete calendar
router.delete('/:id', async (req: WebRequest, res: Response) => {
  const userId = req.user?.userId;
  const { id } = req.params;

  try {
    const calendar = await prisma.calendar.findFirst({
      where: { id, userId }
    });

    if (!calendar) {
      return res.status(404).json({ error: 'Not Found', message: 'Calendar not found' });
    }

    // Don't delete the last user calendar if it's local (we want to preserve at least one calendar)
    const count = await prisma.calendar.count({
      where: { userId }
    });

    if (count <= 1) {
      return res.status(400).json({ error: 'Bad Request', message: 'You must keep at least one calendar active.' });
    }

    await prisma.calendar.delete({
      where: { id }
    });

    res.json({ message: 'Calendar deleted successfully' });
  } catch (error) {
    console.error('[Calendars Route] Delete error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/calendars/:id/sync - Manually trigger sync for subscription
router.post('/:id/sync', async (req: WebRequest, res: Response) => {
  const userId = req.user?.userId;
  const { id } = req.params;

  try {
    const calendar = await prisma.calendar.findFirst({
      where: { id, userId }
    });

    if (!calendar) {
      return res.status(404).json({ error: 'Not Found', message: 'Calendar not found' });
    }

    if (!calendar.isReadOnly || !calendar.feedUrl) {
      return res.status(400).json({ error: 'Bad Request', message: 'This calendar is not a subscription feed.' });
    }

    const success = await syncCalendar(calendar.id);
    if (success) {
      res.json({ message: 'Sync completed successfully' });
    } else {
      res.status(502).json({ error: 'Bad Gateway', message: 'Failed to sync with remote server' });
    }
  } catch (error) {
    console.error('[Calendars Route] Sync error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/calendars/:id/import - One-time ICS import
router.post('/:id/import', async (req: WebRequest, res: Response) => {
  const userId = req.user?.userId;
  const { id } = req.params;
  const icsText = req.body.ics;

  if (!icsText) {
    return res.status(400).json({ error: 'Bad Request', message: 'Raw ICS text is required' });
  }

  try {
    const calendar = await prisma.calendar.findFirst({
      where: { id, userId }
    });

    if (!calendar) {
      return res.status(404).json({ error: 'Not Found', message: 'Calendar not found' });
    }

    if (calendar.isReadOnly) {
      return res.status(400).json({ error: 'Bad Request', message: 'Cannot import into a read-only calendar feed' });
    }

    const parsedEvents = parseCalendarIcs(icsText);
    if (parsedEvents.length === 0) {
      return res.status(400).json({ error: 'Bad Request', message: 'No events found in the uploaded ICS data' });
    }

    // Save events in a transaction (we do not delete existing events for local imports, we append them)
    await prisma.$transaction(async (tx) => {
      for (const evt of parsedEvents) {
        // We use upsert or direct create to prevent unique constraint conflicts on the same (calendarId, uid)
        await tx.event.upsert({
          where: {
            calendarId_uid: {
              calendarId: calendar.id,
              uid: evt.uid
            }
          },
          update: {
            summary: evt.summary,
            description: evt.description,
            location: evt.location,
            dtStart: evt.dtStart,
            dtEnd: evt.dtEnd,
            isAllDay: evt.isAllDay,
            rrule: evt.rrule,
            sequence: { increment: 1 },
            etag: `"${Date.now()}-${Math.random().toString(36).substring(2, 6)}"`
          },
          create: {
            uid: evt.uid,
            summary: evt.summary,
            description: evt.description,
            location: evt.location,
            dtStart: evt.dtStart,
            dtEnd: evt.dtEnd,
            isAllDay: evt.isAllDay,
            rrule: evt.rrule,
            sequence: evt.sequence,
            etag: `"${Date.now()}-${Math.random().toString(36).substring(2, 6)}"`,
            calendarId: calendar.id
          }
        });
      }

      // Update syncToken
      await tx.calendar.update({
        where: { id: calendar.id },
        data: { syncToken: { increment: 1 } }
      });
    });

    res.json({ message: 'Import successful', importedCount: parsedEvents.length });
  } catch (error) {
    console.error('[Calendars Route] Import error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
