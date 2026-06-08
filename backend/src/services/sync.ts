import { prisma } from '../db';
import { parseCalendarIcs } from './ical';

// Sync a single remote calendar feed
export async function syncCalendar(calendarId: string): Promise<boolean> {
  const calendar = await prisma.calendar.findUnique({
    where: { id: calendarId }
  });

  if (!calendar || !calendar.isReadOnly || !calendar.feedUrl) {
    console.log(`[Sync Worker] Calendar ${calendarId} is not a valid subscription.`);
    return false;
  }

  console.log(`[Sync Worker] Syncing calendar "${calendar.name}" from ${calendar.feedUrl}`);

  try {
    const res = await fetch(calendar.feedUrl);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const icsText = await res.text();
    const parsedEvents = parseCalendarIcs(icsText);

    // Save parsed events inside a transaction: upsert and delete old ones
    await prisma.$transaction(async (tx) => {
      const remoteUids = parsedEvents.map(e => e.uid);

      // Determine next sync token
      const currentCal = await tx.calendar.findUnique({
        where: { id: calendar.id }
      });
      const nextToken = (currentCal?.syncToken || 0) + 1;

      // 1. Fetch and delete events that are no longer in the remote feed
      const eventsToDelete = await tx.event.findMany({
        where: {
          calendarId: calendar.id,
          uid: { notIn: remoteUids }
        }
      });

      for (const evt of eventsToDelete) {
        await tx.deletedResource.create({
          data: {
            resourceId: evt.id,
            resourceType: 'EVENT',
            calendarId: calendar.id,
            syncToken: nextToken
          }
        });
        await tx.event.delete({
          where: { id: evt.id }
        });
      }

      // 2. Fetch existing events to determine what changed
      const existingEvents = await tx.event.findMany({
        where: {
          calendarId: calendar.id,
          uid: { in: remoteUids }
        }
      });

      const existingMap = new Map(existingEvents.map(e => [e.uid, e]));

      for (const remoteEvt of parsedEvents) {
        const existing = existingMap.get(remoteEvt.uid);

        if (existing) {
          // Check if any fields changed to avoid updating ETag unnecessarily
          const hasChanged = 
            existing.summary !== remoteEvt.summary ||
            existing.description !== remoteEvt.description ||
            existing.location !== remoteEvt.location ||
            existing.dtStart.getTime() !== remoteEvt.dtStart.getTime() ||
            existing.dtEnd.getTime() !== remoteEvt.dtEnd.getTime() ||
            existing.isAllDay !== remoteEvt.isAllDay ||
            existing.rrule !== remoteEvt.rrule ||
            existing.sequence !== remoteEvt.sequence;

          if (hasChanged) {
            await tx.event.update({
              where: { id: existing.id },
              data: {
                summary: remoteEvt.summary,
                description: remoteEvt.description,
                location: remoteEvt.location,
                dtStart: remoteEvt.dtStart,
                dtEnd: remoteEvt.dtEnd,
                isAllDay: remoteEvt.isAllDay,
                rrule: remoteEvt.rrule,
                sequence: remoteEvt.sequence,
                etag: `"${Date.now()}-${Math.random().toString(36).substring(2, 6)}"`,
                syncToken: nextToken
              }
            });
          }
        } else {
          // Insert new event
          await tx.event.create({
            data: {
              uid: remoteEvt.uid,
              summary: remoteEvt.summary,
              description: remoteEvt.description,
              location: remoteEvt.location,
              dtStart: remoteEvt.dtStart,
              dtEnd: remoteEvt.dtEnd,
              isAllDay: remoteEvt.isAllDay,
              rrule: remoteEvt.rrule,
              sequence: remoteEvt.sequence,
              etag: `"${Date.now()}-${Math.random().toString(36).substring(2, 6)}"`,
              calendarId: calendar.id,
              syncToken: nextToken
            }
          });
        }
      }

      // Update calendar details: CTAG / syncToken
      await tx.calendar.update({
        where: { id: calendar.id },
        data: {
          lastSyncedAt: new Date(),
          syncToken: nextToken
        }
      });
    });

    console.log(`[Sync Worker] Calendar "${calendar.name}" synced successfully. Count: ${parsedEvents.length}`);
    return true;
  } catch (error) {
    console.error(`[Sync Worker] Failed syncing calendar "${calendar.name}":`, error);
    return false;
  }
}

// Sync all remote calendar subscriptions in database
export async function syncAllRemoteFeeds() {
  console.log('[Sync Worker] Initiating global sync of remote feeds...');
  try {
    const subscriptions = await prisma.calendar.findMany({
      where: {
        isReadOnly: true,
        feedUrl: { not: null }
      }
    });

    for (const sub of subscriptions) {
      await syncCalendar(sub.id);
    }
    console.log('[Sync Worker] Global sync completed.');
  } catch (error) {
    console.error('[Sync Worker] Error during global sync:', error);
  }
}

// Start recurring scheduler based on SYNC_INTERVAL_HOURS env variable
export function startSyncScheduler() {
  const hours = parseFloat(process.env.SYNC_INTERVAL_HOURS || '6');
  const msInterval = hours * 60 * 60 * 1000;

  console.log(`[Sync Worker] Starting scheduler. Sync interval: ${hours} hours.`);

  // Run a sync immediately on startup (in background)
  syncAllRemoteFeeds();

  // Schedule next syncs
  setInterval(() => {
    syncAllRemoteFeeds();
  }, msInterval);
}
