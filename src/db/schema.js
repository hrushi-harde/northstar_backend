const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/northstar.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000'); // 64MB cache

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    role        TEXT NOT NULL CHECK(role IN ('executive','manager','employee')),
    title       TEXT NOT NULL,
    department  TEXT NOT NULL,
    avatar      TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    manager_id  TEXT NOT NULL REFERENCES users(id),
    health      TEXT NOT NULL DEFAULT 'healthy' CHECK(health IN ('healthy','at-risk','blocked')),
    progress    INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
    risk        TEXT NOT NULL DEFAULT 'low' CHECK(risk IN ('low','medium','high','critical')),
    blockers    INTEGER NOT NULL DEFAULT 0,
    department  TEXT NOT NULL,
    deadline    TEXT,
    morale      INTEGER NOT NULL DEFAULT 70 CHECK(morale BETWEEN 0 AND 100),
    tags        TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS project_members (
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS updates (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES users(id),
    signals         TEXT NOT NULL DEFAULT '[]',
    extracted_metrics TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    update_id   TEXT NOT NULL REFERENCES updates(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK(role IN ('user','ai')),
    content     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS blockers (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    reported_by TEXT NOT NULL REFERENCES users(id),
    title       TEXT NOT NULL,
    description TEXT,
    severity    TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN ('low','medium','high','critical')),
    status      TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in-progress','resolved')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  );

  CREATE TABLE IF NOT EXISTS ai_insights (
    id          TEXT PRIMARY KEY,
    project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
    severity    TEXT NOT NULL CHECK(severity IN ('info','medium','high','critical')),
    message     TEXT NOT NULL,
    icon        TEXT NOT NULL DEFAULT '🔵',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activity_feed (
    id          TEXT PRIMARY KEY,
    user_id     TEXT REFERENCES users(id),
    action      TEXT NOT NULL,
    project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
    type        TEXT NOT NULL DEFAULT 'update',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS morale_history (
    id          TEXT PRIMARY KEY,
    department  TEXT NOT NULL,
    score       INTEGER NOT NULL,
    week_label  TEXT NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS project_progress_history (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    progress    INTEGER NOT NULL,
    week_label  TEXT NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;

// ── Indexes (created once, idempotent) ─────────────────────────────────────
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_email        ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_role         ON users(role);
  CREATE INDEX IF NOT EXISTS idx_users_department   ON users(department);
  CREATE INDEX IF NOT EXISTS idx_projects_health    ON projects(health);
  CREATE INDEX IF NOT EXISTS idx_projects_risk      ON projects(risk);
  CREATE INDEX IF NOT EXISTS idx_projects_dept      ON projects(department);
  CREATE INDEX IF NOT EXISTS idx_projects_manager   ON projects(manager_id);
  CREATE INDEX IF NOT EXISTS idx_updates_project    ON updates(project_id);
  CREATE INDEX IF NOT EXISTS idx_updates_user       ON updates(user_id);
  CREATE INDEX IF NOT EXISTS idx_updates_created    ON updates(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_update    ON messages(update_id);
  CREATE INDEX IF NOT EXISTS idx_blockers_project   ON blockers(project_id);
  CREATE INDEX IF NOT EXISTS idx_blockers_status    ON blockers(status);
  CREATE INDEX IF NOT EXISTS idx_blockers_severity  ON blockers(severity);
  CREATE INDEX IF NOT EXISTS idx_insights_project   ON ai_insights(project_id);
  CREATE INDEX IF NOT EXISTS idx_insights_severity  ON ai_insights(severity);
  CREATE INDEX IF NOT EXISTS idx_activity_project   ON activity_feed(project_id);
  CREATE INDEX IF NOT EXISTS idx_activity_user      ON activity_feed(user_id);
  CREATE INDEX IF NOT EXISTS idx_activity_created   ON activity_feed(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_morale_dept_week   ON morale_history(department, week_label);
  CREATE INDEX IF NOT EXISTS idx_progress_proj_week ON project_progress_history(project_id, week_label);
`);
