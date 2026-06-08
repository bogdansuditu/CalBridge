import { Router, Response } from 'express';
import { prisma } from '../db';
import { requireWebAuth, WebRequest } from '../middlewares/auth';
import { RRule } from 'rrule';

const router = Router();

// Apply requireWebAuth middleware to all endpoints in this file
router.use(requireWebAuth);

// GET /api/events - List all events (supports filtering by calendarId and date ranges)
router.get('/', async (req: WebRequest, res: Response) => {
  const userId = req.user?.userId;
  const { calendarId, start, end } = req.query;

  try {
    // Build query filters
    const whereClause: any = {
      calendar: {
        userId
      }
    };

    if (calendarId) {
      whereClause.calendarId = calendarId as string;
    }

    if (start || end) {
      // Query non-recurring events in range, or any recurring events
      whereClause.OR = [
        {
          rrule: null,
          dtEnd: start ? { gte: new Date(start as string) } : undefined,
          dtStart: end ? { lte: new Date(end as string) } : undefined
        },
        {
          rrule: { not: null }
        }
      ];
    }

    const events = await prisma.event.findMany({
      where: whereClause,
      orderBy: { dtStart: 'asc' }
    });

    const expandedEvents: any[] = [];
    const rangeStart = start ? new Date(start as string) : new Date(Date.now() - 365 * 24 * 3600 * 1000);
    const rangeEnd = end ? new Date(end as string) : new Date(Date.now() + 2 * 365 * 24 * 3600 * 1000);

    for (const event of events) {
      if (!event.rrule) {
        expandedEvents.push({
          ...event,
          originalDtStart: event.dtStart,
          originalDtEnd: event.dtEnd
        });
        continue;
      }

      try {
        const rruleOptions = RRule.parseString(event.rrule);
        rruleOptions.dtstart = new Date(event.dtStart);
        const rule = new RRule(rruleOptions);

        const occurrences = rule.between(rangeStart, rangeEnd, true);
        const duration = new Date(event.dtEnd).getTime() - new Date(event.dtStart).getTime();

        for (const occDate of occurrences) {
          const occStart = occDate;
          const occEnd = new Date(occDate.getTime() + duration);

          expandedEvents.push({
            ...event,
            dtStart: occStart.toISOString(),
            dtEnd: occEnd.toISOString(),
            originalDtStart: event.dtStart,
            originalDtEnd: event.dtEnd
          });
        }
      } catch (err) {
        console.error(`[Events Get] Failed to expand recurrence for event ${event.id}:`, err);
        expandedEvents.push({
          ...event,
          originalDtStart: event.dtStart,
          originalDtEnd: event.dtEnd
        });
      }
    }

    // Sort expanded events by start time
    expandedEvents.sort((a, b) => new Date(a.dtStart).getTime() - new Date(b.dtStart).getTime());

    res.json({ events: expandedEvents });
  } catch (error) {
    console.error('[Events Route] List error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/events - Create a new event
router.post('/', async (req: WebRequest, res: Response) => {
  const userId = req.user?.userId;
  const { calendarId, summary, description, location, dtStart, dtEnd, isAllDay, rrule } = req.body;

  if (!calendarId || !summary || !dtStart || !dtEnd) {
    return res.status(400).json({ error: 'Bad Request', message: 'Missing required fields' });
  }

  try {
    // Check if user owns the calendar and it is not read-only
    const calendar = await prisma.calendar.findFirst({
      where: { id: calendarId, userId }
    });

    if (!calendar) {
      return res.status(404).json({ error: 'Not Found', message: 'Calendar not found' });
    }

    if (calendar.isReadOnly) {
      return res.status(400).json({ error: 'Bad Request', message: 'Cannot write to a read-only calendar' });
    }

    const eventUid = `cb-${Date.now()}-${Math.random().toString(36).substring(2, 10)}@calbridge`;
    const etag = `"${Date.now()}-${Math.random().toString(36).substring(2, 6)}"`;

    const updatedCal = await prisma.calendar.update({
      where: { id: calendarId },
      data: { syncToken: { increment: 1 } }
    });
    const nextToken = updatedCal.syncToken;

    const event = await prisma.event.create({
      data: {
        uid: eventUid,
        summary,
        description: description || null,
        location: location || null,
        dtStart: new Date(dtStart),
        dtEnd: new Date(dtEnd),
        isAllDay: !!isAllDay,
        rrule: rrule || null,
        etag,
        calendarId,
        syncToken: nextToken
      }
    });

    res.status(201).json({ event });
  } catch (error) {
    console.error('[Events Route] Create error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PUT /api/events/:id - Update an event
router.put('/:id', async (req: WebRequest, res: Response) => {
  const userId = req.user?.userId;
  const { id } = req.params;
  const { summary, description, location, dtStart, dtEnd, isAllDay, rrule, calendarId } = req.body;

  try {
    const event = await prisma.event.findFirst({
      where: { id, calendar: { userId } },
      include: { calendar: true }
    });

    if (!event) {
      return res.status(404).json({ error: 'Not Found', message: 'Event not found' });
    }

    if (event.calendar.isReadOnly) {
      return res.status(400).json({ error: 'Bad Request', message: 'Cannot modify events in a read-only calendar' });
    }

    const updateData: any = {};
    if (summary !== undefined) updateData.summary = summary;
    if (description !== undefined) updateData.description = description;
    if (location !== undefined) updateData.location = location;
    if (dtStart !== undefined) updateData.dtStart = new Date(dtStart);
    if (dtEnd !== undefined) updateData.dtEnd = new Date(dtEnd);
    if (isAllDay !== undefined) updateData.isAllDay = !!isAllDay;
    if (rrule !== undefined) updateData.rrule = rrule;

    // Moving calendar
    if (calendarId && calendarId !== event.calendarId) {
      const targetCal = await prisma.calendar.findFirst({
        where: { id: calendarId, userId }
      });
      if (!targetCal) {
        return res.status(400).json({ error: 'Bad Request', message: 'Target calendar not found' });
      }
      if (targetCal.isReadOnly) {
        return res.status(400).json({ error: 'Bad Request', message: 'Cannot move to a read-only calendar' });
      }
      updateData.calendarId = calendarId;
    }

    const nextSequence = (event.sequence || 0) + 1;
    const nextEtag = `"${Date.now()}-${Math.random().toString(36).substring(2, 6)}"`;

    const updatedCal = await prisma.calendar.update({
      where: { id: event.calendarId },
      data: { syncToken: { increment: 1 } }
    });
    const nextToken = updatedCal.syncToken;

    let targetNextToken = nextToken;
    if (calendarId && calendarId !== event.calendarId) {
      const updatedTargetCal = await prisma.calendar.update({
        where: { id: calendarId },
        data: { syncToken: { increment: 1 } }
      });
      targetNextToken = updatedTargetCal.syncToken;
    }

    const updated = await prisma.event.update({
      where: { id },
      data: {
        ...updateData,
        sequence: nextSequence,
        etag: nextEtag,
        syncToken: targetNextToken
      }
    });

    res.json({ event: updated });
  } catch (error) {
    console.error('[Events Route] Update error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/events/:id - Delete an event
router.delete('/:id', async (req: WebRequest, res: Response) => {
  const userId = req.user?.userId;
  const { id } = req.params;

  try {
    const event = await prisma.event.findFirst({
      where: { id, calendar: { userId } },
      include: { calendar: true }
    });

    if (!event) {
      return res.status(404).json({ error: 'Not Found', message: 'Event not found' });
    }

    if (event.calendar.isReadOnly) {
      return res.status(400).json({ error: 'Bad Request', message: 'Cannot delete events from a read-only calendar' });
    }

    const updatedCal = await prisma.calendar.update({
      where: { id: event.calendarId },
      data: { syncToken: { increment: 1 } }
    });
    const nextToken = updatedCal.syncToken;

    await prisma.deletedResource.create({
      data: {
        resourceId: event.id,
        resourceType: 'EVENT',
        calendarId: event.calendarId,
        syncToken: nextToken
      }
    });

    await prisma.event.delete({
      where: { id }
    });

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('[Events Route] Delete error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
