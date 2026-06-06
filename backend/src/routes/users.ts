import { Router, Response } from 'express';
import { prisma } from '../db';
import { hashPassword } from '../utils/auth';
import { requireAdmin, WebRequest } from '../middlewares/auth';

const router = Router();

// Apply requireAdmin middleware to all endpoints in this file
router.use(requireAdmin);

// GET /api/users - List all users with statistics
router.get('/', async (req: WebRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        storageLimit: true,
        createdAt: true,
        _count: {
          select: { calendars: true }
        }
      },
      orderBy: { username: 'asc' }
    });
    res.json({ users });
  } catch (error) {
    console.error('[Users Admin Route] List error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/users - Create a new user
router.post('/', async (req: WebRequest, res: Response) => {
  const { username, password, role, storageLimit } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Bad Request', message: 'Username and password are required' });
  }

  try {
    const cleanUsername = username.toLowerCase().trim();
    
    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { username: cleanUsername }
    });

    if (existing) {
      return res.status(400).json({ error: 'Conflict', message: 'Username is already taken' });
    }

    const passwordHash = hashPassword(password);
    const newUser = await prisma.user.create({
      data: {
        username: cleanUsername,
        passwordHash,
        role: role === 'ADMIN' ? 'ADMIN' : 'USER',
        storageLimit: parseInt(storageLimit, 10) || 0
      }
    });

    // Create a default calendar for the user
    await prisma.calendar.create({
      data: {
        name: 'Personal',
        color: '#3b82f6',
        userId: newUser.id
      }
    });

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
        storageLimit: newUser.storageLimit
      }
    });
  } catch (error) {
    console.error('[Users Admin Route] Create error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PUT /api/users/:id - Update user configuration or password reset
router.put('/:id', async (req: WebRequest, res: Response) => {
  const { id } = req.params;
  const { username, password, role, storageLimit } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }

    const updateData: any = {};

    if (username) {
      const cleanUsername = username.toLowerCase().trim();
      if (cleanUsername !== user.username) {
        // Check conflicts
        const conflict = await prisma.user.findUnique({
          where: { username: cleanUsername }
        });
        if (conflict) {
          return res.status(400).json({ error: 'Conflict', message: 'Username is already taken' });
        }
        updateData.username = cleanUsername;
      }
    }

    if (password) {
      updateData.passwordHash = hashPassword(password);
    }

    if (role) {
      updateData.role = role === 'ADMIN' ? 'ADMIN' : 'USER';
    }

    if (storageLimit !== undefined) {
      updateData.storageLimit = parseInt(storageLimit, 10) || 0;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        role: true,
        storageLimit: true
      }
    });

    res.json({ message: 'User updated successfully', user: updated });
  } catch (error) {
    console.error('[Users Admin Route] Update error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/users/:id - Delete user
router.delete('/:id', async (req: WebRequest, res: Response) => {
  const { id } = req.params;

  if (req.user?.userId === id) {
    return res.status(400).json({ error: 'Bad Request', message: 'You cannot delete your own admin account' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }

    await prisma.user.delete({
      where: { id }
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('[Users Admin Route] Delete error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
