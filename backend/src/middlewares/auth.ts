import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db';
import { verifyToken, verifyPassword, UserTokenPayload } from '../utils/auth';
import { User } from '@prisma/client';

export interface WebRequest extends Request {
  user?: UserTokenPayload;
}

export interface CalDavRequest extends Request {
  user?: User;
}

// Authenticate JWT tokens for web client routes
export function requireWebAuth(req: WebRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing token' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
}

// Authenticate Admin access
export function requireAdmin(req: WebRequest, res: Response, next: NextFunction) {
  requireWebAuth(req, res, () => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
    }
    next();
  });
}

// Authenticate HTTP Basic Auth for CalDAV client sync requests
export async function requireCalDavAuth(req: CalDavRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    // In local development, Apple Calendar/macOS services refuse to send credentials over unencrypted HTTP (even on localhost).
    // To bypass this restriction, we only auto-authenticate native Apple/macOS/iOS sync clients.
    // Standard clients like Thunderbird, browsers, or curl will still be challenged and must provide the correct password.
    if (process.env.NODE_ENV === 'development') {
      const userAgent = req.headers['user-agent'] || '';
      const isAppleClient = /macOS|iOS|accountsd|dataaccessd|reminderd|CalendarAgent|CoreDAV/i.test(userAgent);

      if (isAppleClient) {
        console.log(`[CalDAV Auth Bypass] Dev Mode: Auto-authenticating request path: ${req.path}`);
        
        const pathParts = req.path.split('/');
        const userIdx = pathParts.indexOf('users');
        let username = '';
        if (userIdx !== -1 && pathParts[userIdx + 1]) {
          username = pathParts[userIdx + 1].toLowerCase().trim();
        }

        let user = null;
        if (username) {
          user = await prisma.user.findUnique({
            where: { username }
          });
        }

        if (!user) {
          // Fallback to the first user in DB
          user = await prisma.user.findFirst();
        }

        if (user) {
          console.log(`[CalDAV Auth Bypass] Successfully logged in as "${user.username}"`);
          req.user = user;
          return next();
        }
      }
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="CalBridge"');
    return res.status(401).send('Unauthorized');
  }

  try {
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [rawUsername, password] = credentials.split(':');

    if (!rawUsername || !password) {
      res.setHeader('WWW-Authenticate', 'Basic realm="CalBridge"');
      return res.status(401).send('Unauthorized');
    }

    const username = rawUsername.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { username }
    });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.setHeader('WWW-Authenticate', 'Basic realm="CalBridge"');
      return res.status(401).send('Unauthorized');
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('[CalDAV Auth Error]', error);
    res.setHeader('WWW-Authenticate', 'Basic realm="CalBridge"');
    return res.status(401).send('Unauthorized');
  }
}
