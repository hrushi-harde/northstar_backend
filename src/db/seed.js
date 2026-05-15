require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./schema');

console.log('🌱 Seeding NorthStar database...');

// Clear existing data
db.exec(`
  DELETE FROM activity_feed;
  DELETE FROM morale_history;
  DELETE FROM project_progress_history;
  DELETE FROM ai_insights;
  DELETE FROM blockers;
  DELETE FROM messages;
  DELETE FROM updates;
  DELETE FROM project_members;
  DELETE FROM projects;
  DELETE FROM users;
`);

const hash = (pw) => bcrypt.hashSync(pw, 10);

// ── Users ──────────────────────────────────────────────────────────────────
const users = [
  { id: 'u1', name: 'Sarah Chen',    email: 'sarah.chen@northstar.io',   password: hash('demo1234'), role: 'executive', title: 'CEO',                  department: 'Executive',   avatar: 'SC' },
  { id: 'u2', name: 'Marcus Webb',   email: 'marcus.webb@northstar.io',  password: hash('demo1234'), role: 'manager',   title: 'Engineering Manager',  department: 'Engineering', avatar: 'MW' },
  { id: 'u3', name: 'Priya Nair',    email: 'priya.nair@northstar.io',   password: hash('demo1234'), role: 'manager',   title: 'Product Manager',      department: 'Product',     avatar: 'PN' },
  { id: 'u4', name: 'James Liu',     email: 'james.liu@northstar.io',    password: hash('demo1234'), role: 'employee',  title: 'Senior Engineer',      department: 'Engineering', avatar: 'JL' },
  { id: 'u5', name: 'Aisha Okafor',  email: 'aisha.okafor@northstar.io', password: hash('demo1234'), role: 'employee',  title: 'Frontend Engineer',    department: 'Engineering', avatar: 'AO' },
  { id: 'u6', name: 'Tom Reyes',     email: 'tom.reyes@northstar.io',    password: hash('demo1234'), role: 'employee',  title: 'QA Engineer',          department: 'QA',          avatar: 'TR' },
  { id: 'u7', name: 'Elena Vasquez', email: 'elena.vasquez@northstar.io',password: hash('demo1234'), role: 'employee',  title: 'Backend Engineer',     department: 'Engineering', avatar: 'EV' },
  { id: 'u8', name: 'David Kim',     email: 'david.kim@northstar.io',    password: hash('demo1234'), role: 'employee',  title: 'DevOps Engineer',      department: 'Platform',    avatar: 'DK' },
];

const insertUser = db.prepare(`
  INSERT INTO users (id, name, email, password, role, title, department, avatar)
  VALUES (@id, @name, @email, @password, @role, @title, @department, @avatar)
`);
users.forEach(u => insertUser.run(u));
console.log(`  ✓ ${users.length} users`);

// ── Projects ───────────────────────────────────────────────────────────────
const projects = [
  { id: 'p1', name: 'Project Orion',    description: 'Next-gen customer platform with AI-powered personalization engine', manager_id: 'u2', health: 'at-risk', progress: 62, risk: 'high',     blockers: 3, department: 'Engineering', deadline: '2026-06-30', morale: 58, tags: JSON.stringify(['AI','Platform','Q2']) },
  { id: 'p2', name: 'Atlas Redesign',   description: 'Complete UI/UX overhaul of the core product dashboard',             manager_id: 'u3', health: 'healthy', progress: 81, risk: 'low',      blockers: 0, department: 'Product',     deadline: '2026-05-28', morale: 84, tags: JSON.stringify(['Design','UX','Q2']) },
  { id: 'p3', name: 'Infra Migration',  description: 'Kubernetes migration and cloud infrastructure modernization',        manager_id: 'u2', health: 'blocked', progress: 34, risk: 'critical', blockers: 5, department: 'Platform',    deadline: '2026-07-15', morale: 42, tags: JSON.stringify(['Infrastructure','DevOps','Q3']) },
  { id: 'p4', name: 'Payments v3',      description: 'Stripe integration upgrade with multi-currency support',             manager_id: 'u3', health: 'healthy', progress: 91, risk: 'low',      blockers: 1, department: 'Engineering', deadline: '2026-05-20', morale: 76, tags: JSON.stringify(['Payments','Integration','Q2']) },
  { id: 'p5', name: 'ML Pipeline',      description: 'Real-time ML inference pipeline for recommendation engine',          manager_id: 'u2', health: 'at-risk', progress: 47, risk: 'medium',   blockers: 2, department: 'Engineering', deadline: '2026-08-01', morale: 65, tags: JSON.stringify(['ML','Data','Q3']) },
];

const insertProject = db.prepare(`
  INSERT INTO projects (id, name, description, manager_id, health, progress, risk, blockers, department, deadline, morale, tags)
  VALUES (@id, @name, @description, @manager_id, @health, @progress, @risk, @blockers, @department, @deadline, @morale, @tags)
`);
projects.forEach(p => insertProject.run(p));
console.log(`  ✓ ${projects.length} projects`);

// ── Project Members ────────────────────────────────────────────────────────
const members = [
  { project_id: 'p1', user_id: 'u4' }, { project_id: 'p1', user_id: 'u5' }, { project_id: 'p1', user_id: 'u7' },
  { project_id: 'p2', user_id: 'u5' }, { project_id: 'p2', user_id: 'u6' },
  { project_id: 'p3', user_id: 'u7' }, { project_id: 'p3', user_id: 'u8' },
  { project_id: 'p4', user_id: 'u4' }, { project_id: 'p4', user_id: 'u6' },
  { project_id: 'p5', user_id: 'u4' }, { project_id: 'p5', user_id: 'u7' }, { project_id: 'p5', user_id: 'u8' },
];
const insertMember = db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (@project_id, @user_id)');
members.forEach(m => insertMember.run(m));
console.log(`  ✓ ${members.length} project members`);

// ── Blockers ───────────────────────────────────────────────────────────────
const blockers = [
  { id: uuidv4(), project_id: 'p1', reported_by: 'u4', title: 'Staging auth service timeout', description: 'Staging server keeps timing out on the auth service. Blocking all deployments.', severity: 'high', status: 'open' },
  { id: uuidv4(), project_id: 'p1', reported_by: 'u5', title: 'QA environment instability', description: 'QA env crashes intermittently during test runs.', severity: 'medium', status: 'open' },
  { id: uuidv4(), project_id: 'p1', reported_by: 'u4', title: 'DevOps escalation pending', description: 'Waiting on DevOps team response for 18+ hours.', severity: 'medium', status: 'in-progress' },
  { id: uuidv4(), project_id: 'p3', reported_by: 'u8', title: 'K8s StorageClass mismatch', description: 'StorageClass mismatch between old and new cluster halting all stateful service migrations.', severity: 'critical', status: 'open' },
  { id: uuidv4(), project_id: 'p3', reported_by: 'u8', title: 'Persistent volume claims failing', description: 'PVCs fail on new nodes — root cause under investigation.', severity: 'critical', status: 'open' },
  { id: uuidv4(), project_id: 'p3', reported_by: 'u7', title: 'Network policy conflicts', description: 'New network policies blocking inter-service communication.', severity: 'high', status: 'open' },
  { id: uuidv4(), project_id: 'p3', reported_by: 'u8', title: 'Vendor support ticket open', description: 'Waiting on cloud vendor response for StorageClass issue.', severity: 'medium', status: 'in-progress' },
  { id: uuidv4(), project_id: 'p3', reported_by: 'u7', title: 'Migration rollback plan missing', description: 'No documented rollback procedure for stateful services.', severity: 'high', status: 'open' },
  { id: uuidv4(), project_id: 'p4', reported_by: 'u6', title: 'Stripe webhook signature mismatch', description: 'Webhook validation failing in staging for multi-currency events.', severity: 'low', status: 'in-progress' },
  { id: uuidv4(), project_id: 'p5', reported_by: 'u4', title: 'GPU quota exceeded in dev cluster', description: 'ML training jobs failing due to GPU quota limits.', severity: 'high', status: 'open' },
  { id: uuidv4(), project_id: 'p5', reported_by: 'u7', title: 'Data pipeline latency spike', description: 'Inference pipeline latency increased 3x after last deploy.', severity: 'medium', status: 'open' },
];
const insertBlocker = db.prepare(`
  INSERT INTO blockers (id, project_id, reported_by, title, description, severity, status)
  VALUES (@id, @project_id, @reported_by, @title, @description, @severity, @status)
`);
blockers.forEach(b => insertBlocker.run(b));
console.log(`  ✓ ${blockers.length} blockers`);

// ── Updates & Messages ─────────────────────────────────────────────────────
const updatesData = [
  {
    id: 'upd1', project_id: 'p1', user_id: 'u4',
    signals: JSON.stringify(['blocker', 'risk']),
    extracted_metrics: JSON.stringify({ prsReviewed: 5, blockers: 1, riskLevel: 'high' }),
    messages: [
      { role: 'user', content: 'Reviewed 5 PRs today but deployment is blocked due to QA environment issues. The staging server keeps timing out on the auth service.' },
      { role: 'ai',  content: "Thanks James. I'm detecting a deployment blocker here. A few follow-up questions:\n\n1. How long has the staging server been timing out?\n2. Is this affecting other team members too?\n3. Have you escalated to DevOps yet?" },
      { role: 'user', content: "It's been happening since yesterday afternoon. Yes, Aisha is also blocked. I pinged David but no response yet." },
      { role: 'ai',  content: "Got it. I've flagged this as a team-wide blocker on Project Orion. Signals detected:\n\n🔴 Deployment blocked — staging auth service timeout\n👥 2 engineers affected (James Liu, Aisha Okafor)\n⚠️ Escalation pending — DevOps unresponsive\n\nThis is increasing delivery risk for the Q2 deadline. I'll surface this to Marcus." },
    ],
  },
  {
    id: 'upd2', project_id: 'p3', user_id: 'u8',
    signals: JSON.stringify(['blocker', 'risk']),
    extracted_metrics: JSON.stringify({ daysBlocked: 2, blockers: 1, riskLevel: 'critical' }),
    messages: [
      { role: 'user', content: "K8s cluster migration is stuck. The persistent volume claims are failing on the new nodes and I can't figure out why. Been on this for 2 days." },
      { role: 'ai',  content: "That sounds frustrating. Two days on a single blocker is significant. Can you tell me:\n\n1. What error are you seeing on the PVC failures?\n2. Have you checked the storage class configuration?\n3. Is this blocking the entire migration or just specific services?" },
      { role: 'user', content: "StorageClass mismatch between old and new cluster. It's blocking everything — can't migrate any stateful services until this is resolved." },
      { role: 'ai',  content: "Critical blocker identified. This is a full migration halt.\n\n🔴 CRITICAL: StorageClass mismatch blocking entire K8s migration\n📅 2 days lost — significant schedule impact\n🚨 All stateful service migrations halted\n\nRecommendation: Escalate immediately to infrastructure lead. This may require vendor support." },
    ],
  },
];

const insertUpdate = db.prepare(`
  INSERT INTO updates (id, project_id, user_id, signals, extracted_metrics)
  VALUES (@id, @project_id, @user_id, @signals, @extracted_metrics)
`);
const insertMessage = db.prepare(`
  INSERT INTO messages (id, update_id, role, content)
  VALUES (@id, @update_id, @role, @content)
`);

updatesData.forEach(u => {
  insertUpdate.run({ id: u.id, project_id: u.project_id, user_id: u.user_id, signals: u.signals, extracted_metrics: u.extracted_metrics });
  u.messages.forEach(m => insertMessage.run({ id: uuidv4(), update_id: u.id, role: m.role, content: m.content }));
});
console.log(`  ✓ ${updatesData.length} updates with messages`);

// ── AI Insights ────────────────────────────────────────────────────────────
const insights = [
  { id: uuidv4(), project_id: 'p3', severity: 'critical', message: 'Critical blocker detected: K8s StorageClass mismatch halting entire migration. 2 days of schedule impact.', icon: '🔴' },
  { id: uuidv4(), project_id: 'p1', severity: 'high',     message: 'Deployment pipeline blocked for 18+ hours. 2 engineers idle. Q2 deadline at risk.', icon: '🟠' },
  { id: uuidv4(), project_id: 'p5', severity: 'medium',   message: 'Team morale dropped 12 points this week. Workload indicators suggest burnout risk.', icon: '🟡' },
  { id: uuidv4(), project_id: 'p2', severity: 'info',     message: 'On track for delivery. Team morale at 84 — highest across all projects this week.', icon: '🟢' },
  { id: uuidv4(), project_id: null, severity: 'high',     message: 'QA blockers increased 27% this week across Engineering and Platform teams.', icon: '🟠' },
];
const insertInsight = db.prepare(`
  INSERT INTO ai_insights (id, project_id, severity, message, icon)
  VALUES (@id, @project_id, @severity, @message, @icon)
`);
insights.forEach(i => insertInsight.run(i));
console.log(`  ✓ ${insights.length} AI insights`);

// ── Activity Feed ──────────────────────────────────────────────────────────
const activities = [
  { id: uuidv4(), user_id: 'u4',  action: 'submitted update',          project_id: 'p1', type: 'update' },
  { id: uuidv4(), user_id: null,  action: 'detected critical blocker',  project_id: 'p3', type: 'alert' },
  { id: uuidv4(), user_id: 'u8',  action: 'submitted update',          project_id: 'p3', type: 'update' },
  { id: uuidv4(), user_id: 'u5',  action: 'reported blocker',          project_id: 'p1', type: 'blocker' },
  { id: uuidv4(), user_id: null,  action: 'generated weekly summary',  project_id: null, type: 'ai' },
  { id: uuidv4(), user_id: 'u7',  action: 'submitted update',          project_id: 'p5', type: 'update' },
  { id: uuidv4(), user_id: 'u6',  action: 'resolved blocker',          project_id: 'p4', type: 'resolved' },
];
const insertActivity = db.prepare(`
  INSERT INTO activity_feed (id, user_id, action, project_id, type)
  VALUES (@id, @user_id, @action, @project_id, @type)
`);
activities.forEach(a => insertActivity.run(a));
console.log(`  ✓ ${activities.length} activity entries`);

// ── Morale History ─────────────────────────────────────────────────────────
const moraleHistory = [
  ['W1', 'Engineering', 72], ['W1', 'Product', 80], ['W1', 'Platform', 65], ['W1', 'QA', 70],
  ['W2', 'Engineering', 68], ['W2', 'Product', 82], ['W2', 'Platform', 58], ['W2', 'QA', 66],
  ['W3', 'Engineering', 65], ['W3', 'Product', 79], ['W3', 'Platform', 52], ['W3', 'QA', 71],
  ['W4', 'Engineering', 61], ['W4', 'Product', 84], ['W4', 'Platform', 45], ['W4', 'QA', 68],
  ['W5', 'Engineering', 63], ['W5', 'Product', 83], ['W5', 'Platform', 42], ['W5', 'QA', 65],
];
const insertMorale = db.prepare(`
  INSERT INTO morale_history (id, department, score, week_label)
  VALUES (@id, @department, @score, @week_label)
`);
moraleHistory.forEach(([week, dept, score]) =>
  insertMorale.run({ id: uuidv4(), department: dept, score, week_label: week })
);
console.log(`  ✓ ${moraleHistory.length} morale history records`);

// ── Project Progress History ───────────────────────────────────────────────
const progressHistory = [
  ['p1', 'W1', 20], ['p1', 'W2', 35], ['p1', 'W3', 48], ['p1', 'W4', 55], ['p1', 'W5', 62],
  ['p2', 'W1', 45], ['p2', 'W2', 58], ['p2', 'W3', 67], ['p2', 'W4', 75], ['p2', 'W5', 81],
  ['p3', 'W1', 10], ['p3', 'W2', 18], ['p3', 'W3', 25], ['p3', 'W4', 30], ['p3', 'W5', 34],
  ['p4', 'W1', 60], ['p4', 'W2', 72], ['p4', 'W3', 80], ['p4', 'W4', 87], ['p4', 'W5', 91],
  ['p5', 'W1', 15], ['p5', 'W2', 25], ['p5', 'W3', 35], ['p5', 'W4', 42], ['p5', 'W5', 47],
];
const insertProgress = db.prepare(`
  INSERT INTO project_progress_history (id, project_id, progress, week_label)
  VALUES (@id, @project_id, @progress, @week_label)
`);
progressHistory.forEach(([pid, week, progress]) =>
  insertProgress.run({ id: uuidv4(), project_id: pid, progress, week_label: week })
);
console.log(`  ✓ ${progressHistory.length} progress history records`);

console.log('\n✅ Database seeded successfully!');
console.log('   All demo accounts use password: demo1234');
console.log('   Executive: sarah.chen@northstar.io');
console.log('   Manager:   marcus.webb@northstar.io');
console.log('   Employee:  james.liu@northstar.io');
