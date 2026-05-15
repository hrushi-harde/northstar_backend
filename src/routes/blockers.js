const router = require('express').Router();
const prisma = require('../db/prisma');
const { authenticate } = require('../middleware/auth');
const { validate }     = require('../middleware/validate');

router.use(authenticate);

function formatBlocker(b) {
  return {
    ...b,
    status:          b.status === 'in_progress' ? 'in-progress' : b.status,
    reporter_name:   b.reporter?.name,
    reporter_avatar: b.reporter?.avatar,
    project_name:    b.project?.name,
    reporter: undefined,
    project:  undefined,
  };
}

// GET /api/blockers
router.get('/', async (req, res) => {
  try {
    const { project_id, status, severity } = req.query;
    const blockers = await prisma.blocker.findMany({
      where: {
        ...(project_id && { projectId: project_id }),
        ...(status     && { status: status === 'in-progress' ? 'in_progress' : status }),
        ...(severity   && { severity }),
      },
      include: {
        reporter: { select: { name: true, avatar: true } },
        project:  { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ blockers: blockers.map(formatBlocker) });
  } catch (err) {
    console.error('[blockers GET /]', err);
    res.status(500).json({ error: 'Failed to fetch blockers' });
  }
});

// POST /api/blockers
router.post('/',
  validate({
    project_id: { required: true, type: 'string' },
    title:      { required: true, type: 'string', minLength: 3 },
    severity:   { required: true, enum: ['low', 'medium', 'high', 'critical'] },
  }),
  async (req, res) => {
    try {
      const { project_id, title, description, severity } = req.body;

      const project = await prisma.project.findUnique({ where: { id: project_id } });
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const [blocker] = await prisma.$transaction([
        prisma.blocker.create({
          data: { projectId: project_id, reportedBy: req.user.id, title, description: description || '', severity },
        }),
        prisma.project.update({
          where: { id: project_id },
          data:  { blockers: { increment: 1 } },
        }),
        prisma.activityFeed.create({
          data: { userId: req.user.id, action: 'reported blocker', projectId: project_id, type: 'blocker' },
        }),
      ]);

      res.status(201).json({ blocker: formatBlocker(blocker) });
    } catch (err) {
      console.error('[blockers POST /]', err);
      res.status(500).json({ error: 'Failed to create blocker' });
    }
  }
);

// PATCH /api/blockers/:id
router.patch('/:id', async (req, res) => {
  try {
    const existing = await prisma.blocker.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Blocker not found' });

    const { status, title, description, severity } = req.body;
    const data = {};
    if (title)       data.title       = title;
    if (description) data.description = description;
    if (severity)    data.severity    = severity;
    if (status) {
      data.status = status === 'in-progress' ? 'in_progress' : status;
      if (status === 'resolved') data.resolvedAt = new Date();
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const ops = [prisma.blocker.update({ where: { id: req.params.id }, data })];

    if (status === 'resolved') {
      ops.push(
        prisma.project.update({
          where: { id: existing.projectId },
          data:  { blockers: { decrement: 1 } },
        }),
        prisma.activityFeed.create({
          data: { userId: req.user.id, action: 'resolved blocker', projectId: existing.projectId, type: 'resolved' },
        })
      );
    }

    const [blocker] = await prisma.$transaction(ops);
    res.json({ blocker: formatBlocker(blocker) });
  } catch (err) {
    console.error('[blockers PATCH /:id]', err);
    res.status(500).json({ error: 'Failed to update blocker' });
  }
});

module.exports = router;
