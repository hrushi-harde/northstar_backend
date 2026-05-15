const router = require('express').Router();
const prisma = require('../db/prisma');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const { role, department } = req.query;
    const users = await prisma.user.findMany({
      where: {
        ...(role       && { role }),
        ...(department && { department }),
      },
      select: { id: true, name: true, email: true, role: true, title: true, department: true, avatar: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
    res.json({ users });
  } catch (err) {
    console.error('[users GET /]', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/users/:id
router.get('/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, email: true, role: true, title: true, department: true, avatar: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { managerId: req.params.id },
          { members: { some: { userId: req.params.id } } },
        ],
      },
      select: { id: true, name: true, health: true, progress: true, risk: true, blockers: true, morale: true, department: true },
      orderBy: { name: 'asc' },
    });

    res.json({ user, projects });
  } catch (err) {
    console.error('[users GET /:id]', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// GET /api/users/:id/projects
router.get('/:id/projects', async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { managerId: req.params.id },
          { members: { some: { userId: req.params.id } } },
        ],
      },
      include: { manager: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ projects });
  } catch (err) {
    console.error('[users GET /:id/projects]', err);
    res.status(500).json({ error: 'Failed to fetch user projects' });
  }
});

module.exports = router;
