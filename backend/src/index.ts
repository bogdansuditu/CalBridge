import app from './app';
import { startSyncScheduler } from './services/sync';
import { prisma } from './db';

const port = process.env.PORT || 5000;

// One-time startup database cleanup to clear timezone transition rules mistakenly stored as event RRULEs
async function cleanCorruptedRules() {
  try {
    const corruptedRrules = [
      'FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
      'FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU'
    ];

    const result = await prisma.event.updateMany({
      where: {
        rrule: {
          in: corruptedRrules
        }
      },
      data: {
        rrule: null
      }
    });

    if (result.count > 0) {
      console.log(`[Database Cleanup] Successfully cleared corrupted timezone transition rules on ${result.count} events.`);
    }
  } catch (error) {
    console.error('[Database Cleanup] Error during startup database cleanup:', error);
  }
}

// Start the server
const server = app.listen(port, () => {
  console.log(`[Server] CalBridge running internally on port ${port}`);
  
  // Run database cleanup then start remote calendar sync worker scheduler
  cleanCorruptedRules().then(() => {
    try {
      startSyncScheduler();
    } catch (error) {
      console.error('[Server] Failed to start remote sync worker scheduler:', error);
    }
  });
});

// Graceful shutdown
const shutdown = () => {
  console.log('[Server] Shutdown signal received. Shutting down gracefully...');
  server.close(() => {
    console.log('[Server] Process terminated.');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

