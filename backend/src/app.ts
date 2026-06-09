import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';

import authRouter from './routes/auth';
import usersRouter from './routes/users';
import calendarsRouter from './routes/calendars';
import eventsRouter from './routes/events';
import todosRouter from './routes/todos';
import caldavRouter from './routes/caldav';

const app = express();

// Enable CORS only for REST API endpoints
app.use('/api', cors({
  origin: '*',
  allowedHeaders: ['Content-Type', 'Authorization', 'Depth', 'Prefer'],
  exposedHeaders: ['ETag', 'DAV', 'WWW-Authenticate']
}));

// Disable caching for all REST API endpoints to ensure real-time updates (especially after POST/PUT/DELETE)
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Express built-in body parsers
app.use(express.json());

// Plain text body parser for XML and iCalendar data (crucial for CalDAV PROPFIND, REPORT, PUT)
app.use(express.text({
  type: ['text/xml', 'application/xml', 'text/calendar'],
  limit: '10mb'
}));

// Lightweight request logging middleware for debugging CalDAV sync clients (placed after body parsers to capture request bodies)
app.use((req, res, next) => {
  const hasBody = req.body && typeof req.body === 'string' && req.body.length > 0;
  console.log(`[Request] ${req.method} ${req.path} - Headers: ${JSON.stringify({
    'user-agent': req.headers['user-agent'],
    'authorization': req.headers.authorization ? 'Present' : 'None',
    'depth': req.headers.depth
  })}${hasBody ? `\nBody:\n${req.body}` : ''}`);
  next();
});

// Redirect root level WebDAV requests to the CalDAV endpoint
app.all('/', (req, res, next) => {
  if (req.method === 'PROPFIND' || req.method === 'OPTIONS' || req.method === 'PROPPATCH') {
    return res.redirect(307, '/caldav/');
  }
  next();
});

// Redirect standard Apple/iCloud probed paths to the CalDAV principal
app.all('/calendar/dav/:username*', (req, res) => {
  const username = (req.params as any).username;
  console.log(`[Redirect] Probed path matched. Redirecting client to /caldav/users/${username}/`);
  res.redirect(307, `/caldav/users/${username}/`);
});

app.all('/principals*', (req, res) => {
  console.log(`[Redirect] Probed path matched. Redirecting client to /caldav/`);
  res.redirect(307, '/caldav/');
});

// Redirect /.well-known/caldav to CalDAV root endpoint
app.all('/.well-known/caldav', (req, res) => {
  res.redirect(308, '/caldav/');
});

// Register CalDAV Server Protocol endpoint
app.use('/caldav', caldavRouter);

// Register Web UI Client REST API endpoints
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/calendars', calendarsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/todos', todosRouter);

// Serve compiled React frontend static files in production
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// Fallback all non-API and non-CalDAV routes to index.html (supports HTML5 history API SPA routing)
app.get('*', (req: Request, res: Response, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/caldav')) {
    return next();
  }
  res.sendFile(path.join(publicPath, 'index.html'), (err) => {
    if (err) {
      // If index.html is missing (e.g. in development), return a placeholder message
      res.status(200).send('CalBridge Backend is running. Web client is available in development mode on port 3000.');
    }
  });
});

export default app;
