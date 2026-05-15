const router = require('express').Router();
const prisma = require('../db/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

router.use(authenticate);

// ── Shared include shape ───────────────────────────────────────────────────
const PROJECT_INCLUDE = {
  manager: { select: { id: true, name: true, avatar: true, title: true, department: true } },
  members: { include: { user: { select: { id: true, name: true, avatar: true, title: true, department: true } } } },
};

function formatProject(p) {
  if (!p) return null;
  return {
    ...p,
    health: p.health === 'at_risk' ? 'at-risk' : p.health,
    team: p.members?.map(m => m.user) ?? [],
    members: undefined,
  };
}

// GET /api/projects
router.get('/', async (req, res) => {
  try {
    const { health, risk, department, search } = req.query;
    const projects = await prisma.project.findMany({
      where: {
        ...(health     && { health: health === 'at-risk' ? 'at_risk' : health }),
        ...(risk       && { risk }),
        ...(department && { department }),
        ...(search     && { name: { contains: search, mode: 'insensitive' } }),
      },
      include: PROJECT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ projects: projects.map(formatProject) });
  } catch (err) {
    console.error('[projects GET /]', err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// GET /api/projects/:id
router.get('/:id', async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        ...PROJECT_INCLUDE,
        blockerList: {
          include: { reporter: { select: { name: true, avatar: true } } },
          orderBy: { createdAt: 'desc' },
        },
        insights: { orderBy: { createdAt: 'desc' } },
        progressHistory: { orderBy: { recordedAt: 'asc' } },
        updates: {
          include: {
            user: { select: { name: true, avatar: true } },
            messages: { orderBy: { createdAt: 'asc' } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const formatted = formatProject(project);
    formatted.blockerList = project.blockerList.map(b => ({
      ...b,
      status:      b.status === 'in_progress' ? 'in-progress' : b.status,
      reporter_name:   b.reporter?.name,
      reporter_avatar: b.reporter?.avatar,
      reporter: undefined,
    }));
    formatted.progressHistory = project.progressHistory.map(h => ({
      week: h.weekLabel, progress: h.progress,
    }));
    formatted.updates = project.updates.map(u => ({
      ...u,
      author_name:   u.user?.name,
      author_avatar: u.user?.avatar,
      user: undefined,
    }));

    res.json({ project: formatted });
  } catch (err) {
    console.error('[projects GET /:id]', err);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// POST /api/projects
router.post('/',
  requireRole('manager', 'executive'),
  validate({
    name:       { required: true, type: 'string', minLength: 2 },
    manager_id: { required: true, type: 'string' },
    department: { required: true, type: 'string' },
  }),
  async (req, res) => {
    try {
      const { name, description, manager_id, department, deadline, tags = [], members = [] } = req.body;

      const manager = await prisma.user.findFirst({
        where: { id: manager_id, role: { in: ['manager', 'executive'] } },
      });
      if (!manager) return res.status(400).json({ error: 'Invalid manager_id' });

      const project = await prisma.project.create({
        data: {
          name,
          description: description || '',
          managerId: manager_id,
          department,
          deadline: deadline ? new Date(deadline) : null,
          tags,
          members: {
            create: members.map(uid => ({ userId: uid })),
          },
        },
        include: PROJECT_INCLUDE,
      });

      await prisma.activityFeed.create({
        data: { userId: req.user.id, action: 'created project', projectId: project.id, type: 'update' },
      });

      res.status(201).json({ project: formatProject(project) });
    } catch (err) {
      console.error('[projects POST /]', err);
      res.status(500).json({ error: 'Failed to create project' });
    }
  }
);

// PATCH /api/projects/:id
router.patch('/:id',
  requireRole('manager', 'executive'),
  async (req, res) => {
    try {
      const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ error: 'Project not found' });

      const allowed = ['name', 'description', 'health', 'progress', 'risk', 'blockers', 'morale', 'deadline', 'tags'];
      const data = {};
      for (const key of allowed) {
        if (req.body[key] === undefined) continue;
        if (key === 'health')   { data.health   = req.body.health === 'at-risk' ? 'at_risk' : req.body.health; continue; }
        if (key === 'deadline') { data.deadline  = req.body.deadline ? new Date(req.body.deadline) : null; continue; }
        data[key] = req.body[key];
      }

      if (Object.keys(data).length === 0 && !req.body.members) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      if (req.body.members) {
        await prisma.projectMember.deleteMany({ where: { projectId: req.params.id } });
        await prisma.projectMember.createMany({
          data: req.body.members.map(uid => ({ projectId: req.params.id, userId: uid })),
          skipDuplicates: true,
        });
      }

      const project = await prisma.project.update({
        where: { id: req.params.id },
        data,
        include: PROJECT_INCLUDE,
      });

      res.json({ project: formatProject(project) });
    } catch (err) {
      console.error('[projects PATCH /:id]', err);
      res.status(500).json({ error: 'Failed to update project' });
    }
  }
);

// DELETE /api/projects/:id
router.delete('/:id', requireRole('executive'), async (req, res) => {
  try {
    const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Project not found' });
    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ message: 'Project deleted' });
  } catch (err) {
    console.error('[projects DELETE /:id]', err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// GET /api/projects/:id/updates
router.get('/:id/updates', async (req, res) => {
  try {
    const updates = await prisma.update.findMany({
      where: { projectId: req.params.id },
      include: {
        user: { select: { name: true, avatar: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      updates: updates.map(u => ({
        ...u,
        author_name:   u.user?.name,
        author_avatar: u.user?.avatar,
        user: undefined,
      })),
    });
  } catch (err) {
    console.error('[projects GET /:id/updates]', err);
    res.status(500).json({ error: 'Failed to fetch updates' });
  }
});

// GET /api/projects/:id/blockers
router.get('/:id/blockers', async (req, res) => {
  try {
    const blockers = await prisma.blocker.findMany({
      where: { projectId: req.params.id },
      include: { reporter: { select: { name: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      blockers: blockers.map(b => ({
        ...b,
        status:          b.status === 'in_progress' ? 'in-progress' : b.status,
        reporter_name:   b.reporter?.name,
        reporter_avatar: b.reporter?.avatar,
        reporter: undefined,
      })),
    });
  } catch (err) {
    console.error('[projects GET /:id/blockers]', err);
    res.status(500).json({ error: 'Failed to fetch blockers' });
  }
});

module.exports = router;
