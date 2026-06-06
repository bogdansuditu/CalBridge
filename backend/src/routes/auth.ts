import { Router, Response } from 'express';
import { prisma } from '../db';
import { hashPassword, verifyPassword, signToken } from '../utils/auth';
import { requireWebAuth, WebRequest } from '../middlewares/auth';

const router = Router();

// GET /api/auth/setup-status - Check if first-run setup is required
router.get('/setup-status', async (req, res) => {
  try {
    const userCount = await prisma.user.count();
    res.json({ setupRequired: userCount === 0 });
  } catch (error) {
    console.error('[Auth Route] Setup status error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/auth/setup - First-run admin setup
router.post('/setup', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Bad Request', message: 'Username and password are required' });
  }

  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return res.status(400).json({ error: 'Bad Request', message: 'Setup has already been completed' });
    }

    // Create the global admin
    const passwordHash = hashPassword(password);
    const adminUser = await prisma.user.create({
      data: {
        username: username.toLowerCase().trim(),
        passwordHash,
        role: 'ADMIN'
      }
    });

    // Automatically create a default local calendar for the admin
    const defaultCal = await prisma.calendar.create({
      data: {
        name: 'Personal',
        color: '#3b82f6', // blue
        userId: adminUser.id
      }
    });

    const token = signToken({
      userId: adminUser.id,
      username: adminUser.username,
      role: adminUser.role
    });

    res.json({
      message: 'Setup completed successfully',
      token,
      user: {
        id: adminUser.id,
        username: adminUser.username,
        role: adminUser.role,
        accentColor: adminUser.accentColor
      }
    });
  } catch (error) {
    console.error('[Auth Route] Setup error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/auth/login - User login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Bad Request', message: 'Username and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase().trim() }
    });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
    }

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        accentColor: user.accentColor
      }
    });
  } catch (error) {
    console.error('[Auth Route] Login error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/auth/me - Get current logged-in user
router.get('/me', requireWebAuth, async (req: WebRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        username: true,
        role: true,
        storageLimit: true,
        accentColor: true
      }
    });
    if (!user) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    console.error('[Auth Route] Get me error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
