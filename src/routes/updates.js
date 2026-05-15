const router = require('express').Router();
const prisma = require('../db/prisma');
const { authenticate } = require('../middleware/auth');
const { validate }     = require('../middleware/validate');
const { analyseUpdate } = require('../utils/aiEngine');

router.use(authenticate);

// ── Helpers ────────────────────────────────────────────────────────────────

function formatUpdate(u) {
  return {
    ...u,
    author_name:   u.user?.name,
    author_avatar: u.user?.avatar,
    project_name:  u.project?.name,
    user:    undefined,
    project: undefined,
  };
}

async function applyMutations(projectId, mutations) {
  const fields = Object.keys(mutations);
  if (!fields.length) return [];
  const data = {};
  for (const [k, v] of Object.entries(mutations)) {
    if (k === 'health') { data.health = v === 'at-risk' ? 'at_risk' : v; continue; }
    data[k] = v;
  }
  await prisma.project.update({ where: { id: projectId }, data });
  return fields;
}

async function maybeCreateBlocker(projectId, userId, metrics, signals) {
  if (!signals.includes('blocker') || !metrics.blockerTitle) return null;
  const existing = await prisma.blocker.findFirst({
    where: { projectId, title: metrics.blockerTitle, status: { not: 'resolved' } },
  });
  if (existing) return null;

  const severity = metrics.riskLevel === 'critical' ? 'critical'
    : metrics.riskLevel === 'high' ? 'high'
    : signals.includes('risk') ? 'high'
    : 'medium';

  const blocker = await prisma.blocker.create({
    data: {
      projectId, reportedBy: userId,
      title: metrics.blockerTitle,
      description: 'Auto-detected from conversational update.',
      severity,
    },
  });
  await prisma.project.update({ where: { id: projectId }, data: { blockers: { increment: 1 } } });
  return blocker.id;
}

async function maybeResolveBlockers(projectId, userId) {
  // Resolve all open/in-progress blockers for this project
  const openBlockers = await prisma.blocker.findMany({
    where: { projectId, status: { not: 'resolved' } },
  });
  if (!openBlockers.length) return 0;

  await prisma.$transaction([
    prisma.blocker.updateMany({
      where: { projectId, status: { not: 'resolved' } },
      data: { status: 'resolved', resolvedAt: new Date() },
    }),
    prisma.project.update({
      where: { id: projectId },
      data: { blockers: 0 },
    }),
    prisma.activityFeed.create({
      data: { userId, action: 'resolved blocker', projectId, type: 'resolved' },
    }),
  ]);
  return openBlockers.length;
}

// ── GET /api/updates ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { project_id, user_id, limit = 20, offset = 0 } = req.query;
    const updates = await prisma.update.findMany({
      where: {
        ...(req.user.role === 'employee' ? { userId: req.user.id } : user_id ? { userId: user_id } : {}),
        ...(project_id && { projectId: project_id }),
      },
      include: {
        user:     { select: { name: true, avatar: true } },
        project:  { select: { name: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take:  parseInt(limit),
      skip:  parseInt(offset),
    });
    res.json({ updates: updates.map(formatUpdate) });
  } catch (err) {
    console.error('[updates GET /]', err);
    res.status(500).json({ error: 'Failed to fetch updates' });
  }
});

// ── GET /api/updates/:id ───────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const u = await prisma.update.findUnique({
      where: { id: req.params.id },
      include: {
        user:     { select: { name: true, avatar: true } },
        project:  { select: { name: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!u) return res.status(404).json({ error: 'Update not found' });
    if (req.user.role === 'employee' && u.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json({ update: formatUpdate(u) });
  } catch (err) {
    console.error('[updates GET /:id]', err);
    res.status(500).json({ error: 'Failed to fetch update' });
  }
});

// ── POST /api/updates ──────────────────────────────────────────────────────
router.post('/',
  validate({
    project_id: { required: true, type: 'string' },
    content:    { required: true, type: 'string', minLength: 5, maxLength: 2000 },
  }),
  async (req, res) => {
    try {
      const { project_id, content } = req.body;
      const project = await prisma.project.findUnique({ where: { id: project_id } });
      if (!project) return res.status(404).json({ error: 'Project not found' });

      // ── AI analysis ──
      const { response, signals, metrics, projectMutations, insight, usedLLM, blockerResolved } =
        await analyseUpdate(content, { ...project, health: project.health === 'at_risk' ? 'at-risk' : project.health }, [], req.user.name);

      // ── Persist update + messages in one transaction ──
      const update = await prisma.update.create({
        data: {
          projectId: project_id,
          userId:    req.user.id,
          signals,
          extractedMetrics: metrics,
          messages: {
            create: [
              { role: 'user', content },
              { role: 'ai',   content: response },
            ],
          },
        },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });

      // ── Apply project mutations ──
      const updatedFields = await applyMutations(project_id, projectMutations);

      // ── Auto-resolve blockers if employee says they're cleared ──
      let resolvedCount = 0;
      if (blockerResolved) {
        resolvedCount = await maybeResolveBlockers(project_id, req.user.id);
      }

      // ── Auto-create blocker (only if not resolving) ──
      let newBlockerId = null;
      if (!blockerResolved) {
        newBlockerId = await maybeCreateBlocker(project_id, req.user.id, metrics, signals);
      }

      // ── AI insight ──
      if (insight) {
        await prisma.aiInsight.create({
          data: { projectId: project_id, severity: insight.severity, message: insight.message, icon: insight.icon },
        });
      }

      // ── Activity log ──
      const activityOps = [
        prisma.activityFeed.create({ data: { userId: req.user.id, action: 'submitted update', projectId: project_id, type: 'update' } }),
      ];
      if (signals.includes('blocker') && !blockerResolved) {
        activityOps.push(prisma.activityFeed.create({ data: { userId: req.user.id, action: 'reported blocker', projectId: project_id, type: 'blocker' } }));
      }
      if (signals.includes('morale')) {
        activityOps.push(prisma.activityFeed.create({ data: { userId: req.user.id, action: 'flagged morale concern', projectId: project_id, type: 'alert' } }));
      }
      await Promise.all(activityOps);

      const updatedProject = await prisma.project.findUnique({ where: { id: project_id } });

      res.status(201).json({
        update: { id: update.id, project_id, user_id: req.user.id, signals, extracted_metrics: metrics, messages: update.messages },
        aiResponse: response, signals, metrics, projectMutations, updatedFields,
        updatedProject: { ...updatedProject, health: updatedProject.health === 'at_risk' ? 'at-risk' : updatedProject.health },
        newBlockerId, blockerResolved, resolvedCount, insight, usedLLM,
      });
    } catch (err) {
      console.error('[updates POST /]', err);
      res.status(500).json({ error: 'Failed to process update' });
    }
  }
);

// ── POST /api/updates/:id/messages ────────────────────────────────────────
router.post('/:id/messages',
  validate({ content: { required: true, type: 'string', minLength: 1, maxLength: 2000 } }),
  async (req, res) => {
    try {
      const update = await prisma.update.findUnique({
        where: { id: req.params.id },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
      if (!update) return res.status(404).json({ error: 'Update not found' });
      if (req.user.role === 'employee' && update.userId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { content } = req.body;
      const project = await prisma.project.findUnique({ where: { id: update.projectId } });
      const history = update.messages.map(m => ({ role: m.role, content: m.content }));

      // ── AI analysis ──
      const { response, signals, metrics, projectMutations, insight, usedLLM, blockerResolved } =
        await analyseUpdate(content, { ...project, health: project.health === 'at_risk' ? 'at-risk' : project.health }, history, req.user.name);

      // ── Persist messages ──
      await prisma.message.createMany({
        data: [
          { updateId: req.params.id, role: 'user', content },
          { updateId: req.params.id, role: 'ai',   content: response },
        ],
      });

      // ── Merge signals + metrics ──
      const existingSignals = update.signals;
      const mergedSignals   = [...new Set([...existingSignals, ...signals])];
      const mergedMetrics   = { ...(update.extractedMetrics || {}), ...metrics };
      await prisma.update.update({
        where: { id: req.params.id },
        data:  { signals: mergedSignals, extractedMetrics: mergedMetrics },
      });

      // ── Apply mutations ──
      const updatedFields = await applyMutations(update.projectId, projectMutations);

      // ── Auto-resolve blockers if employee says they're cleared ──
      let resolvedCount = 0;
      if (blockerResolved) {
        resolvedCount = await maybeResolveBlockers(update.projectId, req.user.id);
      }

      // ── Auto-create blocker (only if not resolving) ──
      let newBlockerId = null;
      if (!blockerResolved) {
        newBlockerId = await maybeCreateBlocker(update.projectId, req.user.id, metrics, signals);
      }

      // ── AI insight ──
      if (insight) {
        await prisma.aiInsight.create({
          data: { projectId: update.projectId, severity: insight.severity, message: insight.message, icon: insight.icon },
        });
      }

      // ── Activity log for new signals only ──
      const activityOps = [];
      if (signals.includes('blocker') && !existingSignals.includes('blocker') && !blockerResolved) {
        activityOps.push(prisma.activityFeed.create({ data: { userId: req.user.id, action: 'reported blocker', projectId: update.projectId, type: 'blocker' } }));
      }
      if (signals.includes('morale') && !existingSignals.includes('morale')) {
        activityOps.push(prisma.activityFeed.create({ data: { userId: req.user.id, action: 'flagged morale concern', projectId: update.projectId, type: 'alert' } }));
      }
      if (activityOps.length) await Promise.all(activityOps);

      const updatedProject = await prisma.project.findUnique({ where: { id: update.projectId } });

      res.json({
        messages: [{ role: 'user', content }, { role: 'ai', content: response }],
        aiResponse: response, signals, metrics, projectMutations, updatedFields,
        updatedProject: { ...updatedProject, health: updatedProject.health === 'at_risk' ? 'at-risk' : updatedProject.health },
        newBlockerId, blockerResolved, resolvedCount, insight, usedLLM,
      });
    } catch (err) {
      console.error('[updates POST /:id/messages]', err);
      res.status(500).json({ error: 'Failed to process message' });
    }
  }
);

module.exports = router;
