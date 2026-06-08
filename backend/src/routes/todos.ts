import { Router, Response } from 'express';
import { prisma } from '../db';
import { requireWebAuth, WebRequest } from '../middlewares/auth';

const router = Router();

// Apply requireWebAuth middleware to all endpoints in this file
router.use(requireWebAuth);

// GET /api/todos - List all todos (optionally filtered by calendarId)
router.get('/', async (req: WebRequest, res: Response) => {
  const userId = req.user?.userId;
  const { calendarId } = req.query;

  try {
    const whereClause: any = {
      calendar: {
        userId
      }
    };

    if (calendarId) {
      whereClause.calendarId = calendarId as string;
    }

    const todos = await prisma.todo.findMany({
      where: whereClause,
      orderBy: { due: 'asc' }
    });

    res.json({ todos });
  } catch (error) {
    console.error('[Todos Route] List error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/todos - Create a new todo
router.post('/', async (req: WebRequest, res: Response) => {
  const userId = req.user?.userId;
  const { calendarId, summary, description, due, dtStart, priority, status } = req.body;

  if (!calendarId || !summary) {
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

    const todoUid = `cb-todo-${Date.now()}-${Math.random().toString(36).substring(2, 10)}@calbridge`;
    const etag = `"${Date.now()}-${Math.random().toString(36).substring(2, 6)}"`;

    const updatedCal = await prisma.calendar.update({
      where: { id: calendarId },
      data: { syncToken: { increment: 1 } }
    });
    const nextToken = updatedCal.syncToken;

    const todo = await prisma.todo.create({
      data: {
        uid: todoUid,
        summary,
        description: description || null,
        status: status || 'NEEDS-ACTION',
        completedAt: status === 'COMPLETED' ? new Date() : null,
        due: due ? new Date(due) : null,
        dtStart: dtStart ? new Date(dtStart) : null,
        priority: parseInt(priority, 10) || 0,
        etag,
        calendarId,
        syncToken: nextToken
      }
    });

    res.status(201).json({ todo });
  } catch (error) {
    console.error('[Todos Route] Create error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PUT /api/todos/:id - Update a todo
router.put('/:id', async (req: WebRequest, res: Response) => {
  const userId = req.user?.userId;
  const { id } = req.params;
  const { summary, description, due, dtStart, priority, status, completedAt, calendarId } = req.body;

  try {
    const todo = await prisma.todo.findFirst({
      where: { id, calendar: { userId } },
      include: { calendar: true }
    });

    if (!todo) {
      return res.status(404).json({ error: 'Not Found', message: 'Todo not found' });
    }

    if (todo.calendar.isReadOnly) {
      return res.status(400).json({ error: 'Bad Request', message: 'Cannot modify todos in a read-only calendar' });
    }

    const updateData: any = {};
    if (summary !== undefined) updateData.summary = summary;
    if (description !== undefined) updateData.description = description;
    if (due !== undefined) updateData.due = due ? new Date(due) : null;
    if (dtStart !== undefined) updateData.dtStart = dtStart ? new Date(dtStart) : null;
    if (priority !== undefined) updateData.priority = parseInt(priority, 10) || 0;
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'COMPLETED') {
        updateData.completedAt = completedAt ? new Date(completedAt) : new Date();
      } else {
        updateData.completedAt = null;
      }
    } else if (completedAt !== undefined) {
      updateData.completedAt = completedAt ? new Date(completedAt) : null;
    }

    // Moving calendar
    if (calendarId && calendarId !== todo.calendarId) {
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

    const nextSequence = (todo.sequence || 0) + 1;
    const nextEtag = `"${Date.now()}-${Math.random().toString(36).substring(2, 6)}"`;

    const updatedCal = await prisma.calendar.update({
      where: { id: todo.calendarId },
      data: { syncToken: { increment: 1 } }
    });
    const nextToken = updatedCal.syncToken;

    let targetNextToken = nextToken;
    if (calendarId && calendarId !== todo.calendarId) {
      const updatedTargetCal = await prisma.calendar.update({
        where: { id: calendarId },
        data: { syncToken: { increment: 1 } }
      });
      targetNextToken = updatedTargetCal.syncToken;
    }

    const updated = await prisma.todo.update({
      where: { id },
      data: {
        ...updateData,
        sequence: nextSequence,
        etag: nextEtag,
        syncToken: targetNextToken
      }
    });

    res.json({ todo: updated });
  } catch (error) {
    console.error('[Todos Route] Update error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/todos/:id - Delete a todo
router.delete('/:id', async (req: WebRequest, res: Response) => {
  const userId = req.user?.userId;
  const { id } = req.params;

  try {
    const todo = await prisma.todo.findFirst({
      where: { id, calendar: { userId } },
      include: { calendar: true }
    });

    if (!todo) {
      return res.status(404).json({ error: 'Not Found', message: 'Todo not found' });
    }

    if (todo.calendar.isReadOnly) {
      return res.status(400).json({ error: 'Bad Request', message: 'Cannot delete todos from a read-only calendar' });
    }

    const updatedCal = await prisma.calendar.update({
      where: { id: todo.calendarId },
      data: { syncToken: { increment: 1 } }
    });
    const nextToken = updatedCal.syncToken;

    await prisma.deletedResource.create({
      data: {
        resourceId: todo.id,
        resourceType: 'TODO',
        calendarId: todo.calendarId,
        syncToken: nextToken
      }
    });

    await prisma.todo.delete({
      where: { id }
    });

    res.json({ message: 'Todo deleted successfully' });
  } catch (error) {
    console.error('[Todos Route] Delete error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
