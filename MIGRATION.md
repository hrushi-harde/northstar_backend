# NorthStar — SQLite → NeonDB Migration Guide

## What changed

| Before | After |
|--------|-------|
| `better-sqlite3` (local file) | Prisma + PostgreSQL (Neon cloud) |
| Raw `db.prepare().run()` SQL | Prisma Client ORM |
| `src/db/schema.js` | `prisma/schema.prisma` + `src/db/prisma.js` |
| `src/db/seed.js` | `prisma/seed.js` |
| Sync route handlers | Async/await route handlers |

---

## Step 1 — Create a Neon database

1. Go to **https://console.neon.tech** and sign up (free tier is enough).
2. Click **New Project** → give it a name (e.g. `northstar`).
3. Select a region close to your deployment target.
4. Once created, go to **Connection Details**.
5. In the dropdown, select **Prisma** — this shows you both URLs you need.

---

## Step 2 — Set environment variables

Copy `.env.example` to `.env` and fill in your Neon URLs:

```bash
cp .env.example .env
```

```dotenv
# .env
DATABASE_URL="postgresql://USER:PASSWORD@ep-XXXX.us-east-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connect_timeout=15"
DIRECT_URL="postgresql://USER:PASSWORD@ep-XXXX.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

- `DATABASE_URL` — pooled connection via PgBouncer (used by the app at runtime)
- `DIRECT_URL` — direct connection (used by Prisma CLI for migrations only)

> **Never commit `.env` to git.** It's in `.gitignore`.

---

## Step 3 — Install dependencies

```bash
npm install
```

`postinstall` automatically runs `prisma generate`.

---

## Step 4 — Run the migration

This creates the tables in Neon and records the migration:

```bash
npm run db:migrate
# prompts for a migration name, e.g. "init"
```

For production deployments (no interactive prompt):

```bash
npm run db:migrate:prod
```

---

## Step 5 — Seed the database

```bash
npm run db:seed
```

This inserts all demo users, projects, blockers, updates, insights, and history.

---

## Step 6 — Verify

```bash
npm run dev
curl http://localhost:3001/health
# → { "status": "ok", "db": "connected", ... }
```

Open Prisma Studio to browse data visually:

```bash
npm run db:studio
```

---

## Deployment (Render / Railway / Vercel)

Set these environment variables in your hosting dashboard:

```
DATABASE_URL=<pooled Neon URL>
DIRECT_URL=<direct Neon URL>
JWT_SECRET=<strong random string>
GEMINI_API_KEY=<your key>
NODE_ENV=production
FRONTEND_URL=https://your-frontend.vercel.app
```

Add to your build/start command:

```bash
# Build command
npm install && npx prisma generate && npx prisma migrate deploy

# Start command
node src/server.js
```

---

## Common migration issues

### `P1001` — Can't reach database
- Check your `DATABASE_URL` is correct and the Neon project is active.
- Neon free tier pauses after inactivity — the first request wakes it up.

### `P1012` — Schema validation error
- Make sure `url` and `directUrl` are in `prisma.config.ts`, **not** in `schema.prisma`.

### `P3006` — Migration failed
- Run `npm run db:status` to see which migration failed.
- Fix the schema, then run `npm run db:migrate` again.

### `at_risk` vs `at-risk`
- PostgreSQL enums can't contain hyphens. The schema uses `at_risk` internally.
- All routes convert `at_risk` ↔ `at-risk` automatically so the frontend is unaffected.

### Enum `in_progress` vs `in-progress`
- Same pattern — stored as `in_progress`, exposed as `in-progress`.

---

## Rollback strategy

If the migration causes issues in production:

```bash
# 1. Check current migration state
npm run db:status

# 2. Roll back to previous migration (creates a new "down" migration)
npx prisma migrate resolve --rolled-back <migration_name>

# 3. Or reset entirely (DESTROYS ALL DATA — dev only)
npm run db:reset
```

For production rollback, restore from a Neon branch:
- Neon supports **database branching** — create a branch before each migration as a snapshot.
- Go to Neon Console → Branches → Create branch from `main` before migrating.

---

## Available commands

```bash
npm run db:generate      # Regenerate Prisma client after schema changes
npm run db:migrate       # Create + apply a new migration (dev)
npm run db:migrate:prod  # Apply pending migrations (production, no prompt)
npm run db:push          # Push schema without migration history (prototyping only)
npm run db:seed          # Seed demo data
npm run db:studio        # Open Prisma Studio (visual DB browser)
npm run db:reset         # Drop all tables and re-migrate (dev only — DESTRUCTIVE)
npm run db:status        # Show migration status
```

---

## Final folder structure

```
northstar-backend/
├── prisma/
│   ├── schema.prisma          # Prisma schema (PostgreSQL models)
│   ├── seed.js                # Seed script
│   └── migrations/            # Auto-generated migration SQL files
│       └── 20260515_init/
│           └── migration.sql
├── prisma.config.ts           # Prisma 7 config (connection URLs)
├── src/
│   ├── db/
│   │   └── prisma.js          # PrismaClient singleton
│   ├── middleware/
│   │   ├── auth.js            # JWT auth (now async, uses Prisma)
│   │   └── validate.js        # Request validation
│   ├── routes/
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── projects.js
│   │   ├── blockers.js
│   │   ├── updates.js
│   │   ├── analytics.js
│   │   └── insights.js
│   ├── utils/
│   │   └── aiEngine.js        # Gemini AI engine (unchanged)
│   └── server.js              # Express app + DB health check
├── .env                       # Local secrets (gitignored)
├── .env.example               # Template for new developers
├── .gitignore
├── package.json
└── MIGRATION.md               # This file
```
