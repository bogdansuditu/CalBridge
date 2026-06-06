import app from './app';
import { startSyncScheduler } from './services/sync';

const port = process.env.PORT || 5000;

// Start the server
const server = app.listen(port, () => {
  console.log(`[Server] CalBridge running internally on port ${port}`);
  
  // Start the remote calendars synchronization worker scheduler
  try {
    startSyncScheduler();
  } catch (error) {
    console.error('[Server] Failed to start remote sync worker scheduler:', error);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('[Server] Process terminated.');
  });
});
