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

    // Save parsed events inside a transaction: delete old events and insert new ones
    await prisma.$transaction(async (tx) => {
      // Delete existing events
      await tx.event.deleteMany({
        where: { calendarId: calendar.id }
      });

      // Insert new events
      if (parsedEvents.length > 0) {
        await tx.event.createMany({
          data: parsedEvents.map(evt => ({
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
          }))
        });
      }

      // Update calendar details: CTAG / syncToken
      await tx.calendar.update({
        where: { id: calendar.id },
        data: {
          lastSyncedAt: new Date(),
          syncToken: { increment: 1 }
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
