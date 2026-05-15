const router = require('express').Router();
const prisma = require('../db/prisma');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/insights
router.get('/', async (req, res) => {
  try {
    const { severity, project_id, limit = 20 } = req.query;
    const insights = await prisma.aiInsight.findMany({
      where: {
        ...(severity   && { severity }),
        ...(project_id && { projectId: project_id }),
      },
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
    });
    res.json({
      insights: insights.map(i => ({
        ...i,
        project_name: i.project?.name,
        project: undefined,
      })),
    });
  } catch (err) {
    console.error('[insights GET /]', err);
    res.status(500).json({ error: 'Failed to fetch insights' });
  }
});

// GET /api/insights/activity-feed
router.get('/activity-feed', async (req, res) => {
  try {
    const { limit = 15 } = req.query;
    const feed = await prisma.activityFeed.findMany({
      include: {
        user:    { select: { name: true, avatar: true } },
        project: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
    });
    res.json({
      feed: feed.map(a => ({
        ...a,
        user_name:    a.user?.name,
        user_avatar:  a.user?.avatar,
        project_name: a.project?.name,
        user:    undefined,
        project: undefined,
      })),
    });
  } catch (err) {
    console.error('[insights GET /activity-feed]', err);
    res.status(500).json({ error: 'Failed to fetch activity feed' });
  }
});

module.exports = router;
