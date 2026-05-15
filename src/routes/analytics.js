const router = require('express').Router();
const prisma = require('../db/prisma');
const { authenticate } = require('../middleware/auth');
const {
  computeOrgHealthScore,
  computeProjectRiskScore,
  generateRecommendations,
} = require('../utils/aiEngine');

router.use(authenticate);

// GET /api/analytics/overview
router.get('/overview', async (req, res) => {
  try {
    const projects = await prisma.project.findMany();
    const totalBlockers  = projects.reduce((s, p) => s + p.blockers, 0);
    const avgMorale      = projects.length ? Math.round(projects.reduce((s, p) => s + p.morale, 0) / projects.length) : 0;
    const healthyCount   = projects.filter(p => p.health === 'healthy').length;
    const atRiskCount    = projects.filter(p => p.health === 'at_risk').length;
    const blockedCount   = projects.filter(p => p.health === 'blocked').length;
    const activeRisks    = projects.filter(p => p.risk === 'high' || p.risk === 'critical').length;
    const deliveryConf   = projects.length ? Math.round(healthyCount / projects.length * 100) : 0;
    const orgHealth      = computeOrgHealthScore(projects.map(p => ({ ...p, health: p.health === 'at_risk' ? 'at-risk' : p.health })));

    res.json({
      totalProjects: projects.length, activeRisks, avgMorale,
      deliveryConfidence: deliveryConf, blockedProjects: blockedCount,
      healthyProjects: healthyCount, atRiskProjects: atRiskCount,
      totalBlockers, orgHealthScore: orgHealth,
    });
  } catch (err) {
    console.error('[analytics/overview]', err);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

// GET /api/analytics/morale
router.get('/morale', async (req, res) => {
  try {
    const rows = await prisma.moraleHistory.findMany({ orderBy: { recordedAt: 'asc' } });
    const weeks = [...new Set(rows.map(r => r.weekLabel))];
    const pivoted = weeks.map(week => {
      const entry = { week };
      rows.filter(r => r.weekLabel === week).forEach(r => {
        entry[r.department.toLowerCase()] = r.score;
      });
      return entry;
    });
    res.json({ moraleHistory: pivoted });
  } catch (err) {
    console.error('[analytics/morale]', err);
    res.status(500).json({ error: 'Failed to fetch morale history' });
  }
});

// GET /api/analytics/project-health
router.get('/project-health', async (req, res) => {
  try {
    const projects = await prisma.project.findMany();
    const weeks = ['W1', 'W2', 'W3', 'W4', 'W5'];
    const trend = await Promise.all(weeks.map(async week => {
      const progressRows = await prisma.projectProgressHistory.findMany({ where: { weekLabel: week } });
      let healthy = 0, atRisk = 0, blocked = 0;
      progressRows.forEach(row => {
        const p = projects.find(pr => pr.id === row.projectId);
        if (!p) return;
        if (week === 'W5') {
          if (p.health === 'healthy') healthy++;
          else if (p.health === 'at_risk') atRisk++;
          else blocked++;
        } else {
          if (row.progress >= 70) healthy++;
          else if (row.progress >= 30) atRisk++;
          else blocked++;
        }
      });
      return { week, healthy, atRisk, blocked };
    }));
    res.json({ projectHealthHistory: trend });
  } catch (err) {
    console.error('[analytics/project-health]', err);
    res.status(500).json({ error: 'Failed to fetch project health' });
  }
});

// GET /api/analytics/blockers
router.get('/blockers', async (req, res) => {
  try {
    const bySeverity = await prisma.blocker.groupBy({
      by: ['severity'],
      where: { status: { not: 'resolved' } },
      _count: { id: true },
    });

    const byProject = await prisma.blocker.groupBy({
      by: ['projectId'],
      where: { status: { not: 'resolved' } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    const projectNames = await prisma.project.findMany({
      where: { id: { in: byProject.map(b => b.projectId) } },
      select: { id: true, name: true },
    });

    const allBlockers = await prisma.blocker.findMany({
      where: { status: { not: 'resolved' } },
      select: { title: true },
    });

    const categories = { Infrastructure: 0, 'QA / Testing': 0, Dependencies: 0, 'Design Review': 0, Other: 0 };
    allBlockers.forEach(b => {
      const t = b.title.toLowerCase();
      if (/k8s|infra|storage|network|deploy/.test(t))       categories.Infrastructure++;
      else if (/qa|test|staging|environment/.test(t))       categories['QA / Testing']++;
      else if (/depend|vendor|waiting|stripe/.test(t))      categories.Dependencies++;
      else if (/design|review|approval/.test(t))            categories['Design Review']++;
      else                                                   categories.Other++;
    });

    const COLORS = { Infrastructure: '#ef4444', 'QA / Testing': '#f97316', Dependencies: '#eab308', 'Design Review': '#6366f1', Other: '#64748b' };
    const distribution = Object.entries(categories)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, color: COLORS[name] }));

    res.json({
      distribution,
      byProject: byProject.map(b => ({
        name:  projectNames.find(p => p.id === b.projectId)?.name || b.projectId,
        count: b._count.id,
      })),
      bySeverity: bySeverity.map(b => ({ severity: b.severity, count: b._count.id })),
    });
  } catch (err) {
    console.error('[analytics/blockers]', err);
    res.status(500).json({ error: 'Failed to fetch blocker analytics' });
  }
});

// GET /api/analytics/department-activity
router.get('/department-activity', async (req, res) => {
  try {
    const departments = ['Engineering', 'Platform', 'Product', 'QA'];
    const activity = await Promise.all(departments.map(async dept => {
      const [updates, blockers, moraleRow] = await Promise.all([
        prisma.update.count({ where: { user: { department: dept } } }),
        prisma.blocker.count({ where: { project: { department: dept }, status: { not: 'resolved' } } }),
        prisma.moraleHistory.findFirst({ where: { department: dept, weekLabel: 'W5' } }),
      ]);
      return { dept, updates, blockers, morale: moraleRow?.score || 0 };
    }));
    res.json({ departmentActivity: activity });
  } catch (err) {
    console.error('[analytics/department-activity]', err);
    res.status(500).json({ error: 'Failed to fetch department activity' });
  }
});

// GET /api/analytics/workload
router.get('/workload', async (req, res) => {
  try {
    const employees = await prisma.user.findMany({
      where: { role: 'employee' },
      select: { id: true, name: true },
    });

    const workload = await Promise.all(employees.map(async emp => {
      const [projectCount, blockerCount, updateCount] = await Promise.all([
        prisma.projectMember.count({ where: { userId: emp.id } }),
        prisma.blocker.count({ where: { reportedBy: emp.id, status: { not: 'resolved' } } }),
        prisma.update.count({ where: { userId: emp.id } }),
      ]);
      const load = Math.min(100, projectCount * 25 + blockerCount * 10 + updateCount * 5);
      return { id: emp.id, name: emp.name, load, projectCount, blockerCount, updateCount };
    }));

    res.json({ workload });
  } catch (err) {
    console.error('[analytics/workload]', err);
    res.status(500).json({ error: 'Failed to fetch workload' });
  }
});

// GET /api/analytics/engagement
router.get('/engagement', async (req, res) => {
  res.json({
    engagementHistory: [
      { week: 'W1', updates: 18, responses: 15 },
      { week: 'W2', updates: 22, responses: 19 },
      { week: 'W3', updates: 19, responses: 17 },
      { week: 'W4', updates: 25, responses: 22 },
      { week: 'W5', updates: 21, responses: 20 },
    ],
  });
});

// GET /api/analytics/risk-scores
router.get('/risk-scores', async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      select: { id: true, name: true, risk: true, health: true, progress: true, blockers: true },
    });
    res.json({
      riskScores: projects.map(p => ({
        id: p.id, name: p.name,
        score: computeProjectRiskScore(p),
        risk: p.risk,
        health: p.health === 'at_risk' ? 'at-risk' : p.health,
      })),
    });
  } catch (err) {
    console.error('[analytics/risk-scores]', err);
    res.status(500).json({ error: 'Failed to fetch risk scores' });
  }
});

// GET /api/analytics/recommendations
router.get('/recommendations', async (req, res) => {
  try {
    const projects = await prisma.project.findMany();
    const recs = generateRecommendations(
      projects.map(p => ({ ...p, health: p.health === 'at_risk' ? 'at-risk' : p.health }))
    );
    res.json({ recommendations: recs });
  } catch (err) {
    console.error('[analytics/recommendations]', err);
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

// GET /api/analytics/radar
router.get('/radar', async (req, res) => {
  try {
    const projects = await prisma.project.findMany();
    const avgProgress   = projects.length ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length) : 0;
    const avgMorale     = projects.length ? Math.round(projects.reduce((s, p) => s + p.morale, 0) / projects.length) : 0;
    const totalBlockers = projects.reduce((s, p) => s + p.blockers, 0);
    const riskMgmt      = Math.max(0, 100 - totalBlockers * 8);
    res.json({
      radarData: [
        { metric: 'Delivery',      value: avgProgress },
        { metric: 'Morale',        value: avgMorale },
        { metric: 'Velocity',      value: Math.min(100, Math.round(avgProgress * 1.2)) },
        { metric: 'Quality',       value: 82 },
        { metric: 'Collaboration', value: 70 },
        { metric: 'Risk Mgmt',     value: riskMgmt },
      ],
    });
  } catch (err) {
    console.error('[analytics/radar]', err);
    res.status(500).json({ error: 'Failed to fetch radar data' });
  }
});

module.exports = router;
