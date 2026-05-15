/**
 * NorthStar — Prisma seed script
 * Run: npx prisma db seed
 *      or: node prisma/seed.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const hash = pw => bcrypt.hashSync(pw, 10);

async function main() {
  console.log('🌱 Seeding NorthStar database (Neon/PostgreSQL)...\n');

  // ── Wipe in dependency order ──────────────────────────────────────────────
  await prisma.activityFeed.deleteMany();
  await prisma.moraleHistory.deleteMany();
  await prisma.projectProgressHistory.deleteMany();
  await prisma.aiInsight.deleteMany();
  await prisma.blocker.deleteMany();
  await prisma.message.deleteMany();
  await prisma.update.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  console.log('  ✓ Cleared existing data');

  // ── Users ─────────────────────────────────────────────────────────────────
  const users = await prisma.user.createManyAndReturn({
    data: [
      { id: 'u1', name: 'Sarah Chen',    email: 'sarah.chen@northstar.io',    password: hash('demo1234'), role: 'executive', title: 'CEO',                 department: 'Executive',   avatar: 'SC' },
      { id: 'u2', name: 'Marcus Webb',   email: 'marcus.webb@northstar.io',   password: hash('demo1234'), role: 'manager',   title: 'Engineering Manager', department: 'Engineering', avatar: 'MW' },
      { id: 'u3', name: 'Priya Nair',    email: 'priya.nair@northstar.io',    password: hash('demo1234'), role: 'manager',   title: 'Product Manager',     department: 'Product',     avatar: 'PN' },
      { id: 'u4', name: 'James Liu',     email: 'james.liu@northstar.io',     password: hash('demo1234'), role: 'employee',  title: 'Senior Engineer',     department: 'Engineering', avatar: 'JL' },
      { id: 'u5', name: 'Aisha Okafor',  email: 'aisha.okafor@northstar.io',  password: hash('demo1234'), role: 'employee',  title: 'Frontend Engineer',   department: 'Engineering', avatar: 'AO' },
      { id: 'u6', name: 'Tom Reyes',     email: 'tom.reyes@northstar.io',     password: hash('demo1234'), role: 'employee',  title: 'QA Engineer',         department: 'QA',          avatar: 'TR' },
      { id: 'u7', name: 'Elena Vasquez', email: 'elena.vasquez@northstar.io', password: hash('demo1234'), role: 'employee',  title: 'Backend Engineer',    department: 'Engineering', avatar: 'EV' },
      { id: 'u8', name: 'David Kim',     email: 'david.kim@northstar.io',     password: hash('demo1234'), role: 'employee',  title: 'DevOps Engineer',     department: 'Platform',    avatar: 'DK' },
    ],
  });
  console.log(`  ✓ ${users.length} users`);

  // ── Projects ──────────────────────────────────────────────────────────────
  const projects = await prisma.project.createManyAndReturn({
    data: [
      { id: 'p1', name: 'Project Orion',   description: 'Next-gen customer platform with AI-powered personalization engine', managerId: 'u2', health: 'at_risk', progress: 62, risk: 'high',     blockers: 3, department: 'Engineering', deadline: new Date('2026-06-30'), morale: 58, tags: ['AI','Platform','Q2'] },
      { id: 'p2', name: 'Atlas Redesign',  description: 'Complete UI/UX overhaul of the core product dashboard',             managerId: 'u3', health: 'healthy', progress: 81, risk: 'low',      blockers: 0, department: 'Product',     deadline: new Date('2026-05-28'), morale: 84, tags: ['Design','UX','Q2'] },
      { id: 'p3', name: 'Infra Migration', description: 'Kubernetes migration and cloud infrastructure modernization',        managerId: 'u2', health: 'blocked', progress: 34, risk: 'critical', blockers: 5, department: 'Platform',    deadline: new Date('2026-07-15'), morale: 42, tags: ['Infrastructure','DevOps','Q3'] },
      { id: 'p4', name: 'Payments v3',     description: 'Stripe integration upgrade with multi-currency support',             managerId: 'u3', health: 'healthy', progress: 91, risk: 'low',      blockers: 1, department: 'Engineering', deadline: new Date('2026-05-20'), morale: 76, tags: ['Payments','Integration','Q2'] },
      { id: 'p5', name: 'ML Pipeline',     description: 'Real-time ML inference pipeline for recommendation engine',          managerId: 'u2', health: 'at_risk', progress: 47, risk: 'medium',   blockers: 2, department: 'Engineering', deadline: new Date('2026-08-01'), morale: 65, tags: ['ML','Data','Q3'] },
    ],
  });
  console.log(`  ✓ ${projects.length} projects`);

  // ── Project Members ───────────────────────────────────────────────────────
  await prisma.projectMember.createMany({
    data: [
      { projectId: 'p1', userId: 'u4' }, { projectId: 'p1', userId: 'u5' }, { projectId: 'p1', userId: 'u7' },
      { projectId: 'p2', userId: 'u5' }, { projectId: 'p2', userId: 'u6' },
      { projectId: 'p3', userId: 'u7' }, { projectId: 'p3', userId: 'u8' },
      { projectId: 'p4', userId: 'u4' }, { projectId: 'p4', userId: 'u6' },
      { projectId: 'p5', userId: 'u4' }, { projectId: 'p5', userId: 'u7' }, { projectId: 'p5', userId: 'u8' },
    ],
  });
  console.log('  ✓ 12 project members');

  // ── Blockers ──────────────────────────────────────────────────────────────
  await prisma.blocker.createMany({
    data: [
      { projectId: 'p1', reportedBy: 'u4', title: 'Staging auth service timeout',      description: 'Staging server keeps timing out on the auth service.',                              severity: 'high',     status: 'open' },
      { projectId: 'p1', reportedBy: 'u5', title: 'QA environment instability',         description: 'QA env crashes intermittently during test runs.',                                   severity: 'medium',   status: 'open' },
      { projectId: 'p1', reportedBy: 'u4', title: 'DevOps escalation pending',          description: 'Waiting on DevOps team response for 18+ hours.',                                    severity: 'medium',   status: 'in_progress' },
      { projectId: 'p3', reportedBy: 'u8', title: 'K8s StorageClass mismatch',          description: 'StorageClass mismatch between old and new cluster halting all stateful migrations.', severity: 'critical', status: 'open' },
      { projectId: 'p3', reportedBy: 'u8', title: 'Persistent volume claims failing',   description: 'PVCs fail on new nodes — root cause under investigation.',                          severity: 'critical', status: 'open' },
      { projectId: 'p3', reportedBy: 'u7', title: 'Network policy conflicts',           description: 'New network policies blocking inter-service communication.',                         severity: 'high',     status: 'open' },
      { projectId: 'p3', reportedBy: 'u8', title: 'Vendor support ticket open',         description: 'Waiting on cloud vendor response for StorageClass issue.',                          severity: 'medium',   status: 'in_progress' },
      { projectId: 'p3', reportedBy: 'u7', title: 'Migration rollback plan missing',    description: 'No documented rollback procedure for stateful services.',                           severity: 'high',     status: 'open' },
      { projectId: 'p4', reportedBy: 'u6', title: 'Stripe webhook signature mismatch',  description: 'Webhook validation failing in staging for multi-currency events.',                  severity: 'low',      status: 'in_progress' },
      { projectId: 'p5', reportedBy: 'u4', title: 'GPU quota exceeded in dev cluster',  description: 'ML training jobs failing due to GPU quota limits.',                                 severity: 'high',     status: 'open' },
      { projectId: 'p5', reportedBy: 'u7', title: 'Data pipeline latency spike',        description: 'Inference pipeline latency increased 3x after last deploy.',                        severity: 'medium',   status: 'open' },
    ],
  });
  console.log('  ✓ 11 blockers');

  // ── Updates + Messages ────────────────────────────────────────────────────
  await prisma.update.create({
    data: {
      id: 'upd1', projectId: 'p1', userId: 'u4',
      signals: ['blocker', 'risk'],
      extractedMetrics: { prsReviewed: 5, blockers: 1, riskLevel: 'high' },
      messages: {
        create: [
          { role: 'user', content: 'Reviewed 5 PRs today but deployment is blocked due to QA environment issues. The staging server keeps timing out on the auth service.' },
          { role: 'ai',   content: "Thanks James. I'm detecting a deployment blocker here.\n\n1. How long has the staging server been timing out?\n2. Is this affecting other team members too?\n3. Have you escalated to DevOps yet?" },
          { role: 'user', content: "It's been happening since yesterday afternoon. Yes, Aisha is also blocked. I pinged David but no response yet." },
          { role: 'ai',   content: "Got it. I've flagged this as a team-wide blocker on Project Orion.\n\n🔴 Deployment blocked — staging auth service timeout\n👥 2 engineers affected\n⚠️ Escalation pending — DevOps unresponsive" },
        ],
      },
    },
  });

  await prisma.update.create({
    data: {
      id: 'upd2', projectId: 'p3', userId: 'u8',
      signals: ['blocker', 'risk'],
      extractedMetrics: { daysBlocked: 2, blockers: 1, riskLevel: 'critical' },
      messages: {
        create: [
          { role: 'user', content: "K8s cluster migration is stuck. The persistent volume claims are failing on the new nodes. Been on this for 2 days." },
          { role: 'ai',   content: "Two days on a single blocker is significant.\n\n1. What error are you seeing on the PVC failures?\n2. Have you checked the storage class configuration?\n3. Is this blocking the entire migration?" },
          { role: 'user', content: "StorageClass mismatch between old and new cluster. It's blocking everything." },
          { role: 'ai',   content: "🔴 CRITICAL: StorageClass mismatch blocking entire K8s migration\n📅 2 days lost\n🚨 All stateful service migrations halted\n\nRecommendation: Escalate immediately to infrastructure lead." },
        ],
      },
    },
  });
  console.log('  ✓ 2 updates with messages');

  // ── AI Insights ───────────────────────────────────────────────────────────
  await prisma.aiInsight.createMany({
    data: [
      { projectId: 'p3', severity: 'critical', message: 'Critical blocker detected: K8s StorageClass mismatch halting entire migration. 2 days of schedule impact.', icon: '🔴' },
      { projectId: 'p1', severity: 'high',     message: 'Deployment pipeline blocked for 18+ hours. 2 engineers idle. Q2 deadline at risk.',                         icon: '🟠' },
      { projectId: 'p5', severity: 'medium',   message: 'Team morale dropped 12 points this week. Workload indicators suggest burnout risk.',                         icon: '🟡' },
      { projectId: 'p2', severity: 'info',     message: 'On track for delivery. Team morale at 84 — highest across all projects this week.',                          icon: '🟢' },
      { projectId: null, severity: 'high',     message: 'QA blockers increased 27% this week across Engineering and Platform teams.',                                  icon: '🟠' },
    ],
  });
  console.log('  ✓ 5 AI insights');

  // ── Activity Feed ─────────────────────────────────────────────────────────
  await prisma.activityFeed.createMany({
    data: [
      { userId: 'u4', action: 'submitted update',         projectId: 'p1', type: 'update'   },
      { userId: null, action: 'detected critical blocker', projectId: 'p3', type: 'alert'    },
      { userId: 'u8', action: 'submitted update',         projectId: 'p3', type: 'update'   },
      { userId: 'u5', action: 'reported blocker',         projectId: 'p1', type: 'blocker'  },
      { userId: null, action: 'generated weekly summary', projectId: null, type: 'ai'       },
      { userId: 'u7', action: 'submitted update',         projectId: 'p5', type: 'update'   },
      { userId: 'u6', action: 'resolved blocker',         projectId: 'p4', type: 'resolved' },
    ],
  });
  console.log('  ✓ 7 activity entries');

  // ── Morale History ────────────────────────────────────────────────────────
  const moraleRows = [
    ['W1','Engineering',72],['W1','Product',80],['W1','Platform',65],['W1','QA',70],
    ['W2','Engineering',68],['W2','Product',82],['W2','Platform',58],['W2','QA',66],
    ['W3','Engineering',65],['W3','Product',79],['W3','Platform',52],['W3','QA',71],
    ['W4','Engineering',61],['W4','Product',84],['W4','Platform',45],['W4','QA',68],
    ['W5','Engineering',63],['W5','Product',83],['W5','Platform',42],['W5','QA',65],
  ];
  await prisma.moraleHistory.createMany({
    data: moraleRows.map(([weekLabel, department, score]) => ({ weekLabel, department, score })),
  });
  console.log(`  ✓ ${moraleRows.length} morale history records`);

  // ── Project Progress History ──────────────────────────────────────────────
  const progressRows = [
    ['p1','W1',20],['p1','W2',35],['p1','W3',48],['p1','W4',55],['p1','W5',62],
    ['p2','W1',45],['p2','W2',58],['p2','W3',67],['p2','W4',75],['p2','W5',81],
    ['p3','W1',10],['p3','W2',18],['p3','W3',25],['p3','W4',30],['p3','W5',34],
    ['p4','W1',60],['p4','W2',72],['p4','W3',80],['p4','W4',87],['p4','W5',91],
    ['p5','W1',15],['p5','W2',25],['p5','W3',35],['p5','W4',42],['p5','W5',47],
  ];
  await prisma.projectProgressHistory.createMany({
    data: progressRows.map(([projectId, weekLabel, progress]) => ({ projectId, weekLabel, progress })),
  });
  console.log(`  ✓ ${progressRows.length} progress history records`);

  console.log('\n✅ Seed complete!');
  console.log('   Password for all accounts: demo1234');
  console.log('   Executive: sarah.chen@northstar.io');
  console.log('   Manager:   marcus.webb@northstar.io');
  console.log('   Employee:  james.liu@northstar.io');
}

main()
  .catch(e => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
