# NorthStar Backend API

Node.js + Express + SQLite REST API for the NorthStar Operational Intelligence platform.

## Stack
- **Runtime**: Node.js
- **Framework**: Express
- **Database**: SQLite via `better-sqlite3` (zero-config, file-based)
- **Auth**: JWT (jsonwebtoken) + bcrypt password hashing
- **AI Engine**: Rule-based NLP signal detection (drop-in replaceable with OpenAI/Anthropic)

## Quick Start

```bash
# Install dependencies
npm install

# Seed the database with demo data
npm run seed

# Start development server (with auto-reload)
npm run dev

# Start production server
npm start
```

Server runs on **http://localhost:3001**

## Demo Accounts (all use password: `demo1234`)

| Role       | Email                          |
|------------|-------------------------------|
| Executive  | sarah.chen@northstar.io       |
| Manager    | marcus.webb@northstar.io      |
| Employee   | james.liu@northstar.io        |

## API Reference

### Auth
| Method | Endpoint         | Description          |
|--------|-----------------|----------------------|
| POST   | /api/auth/login  | Login, returns JWT   |
| GET    | /api/auth/me     | Current user profile |
| POST   | /api/auth/logout | Logout               |

### Projects
| Method | Endpoint                      | Description                    |
|--------|------------------------------|--------------------------------|
| GET    | /api/projects                 | List all projects (filterable) |
| GET    | /api/projects/:id             | Project detail + team + blockers |
| POST   | /api/projects                 | Create project (manager+)      |
| PATCH  | /api/projects/:id             | Update project                 |
| DELETE | /api/projects/:id             | Delete project (executive)     |
| GET    | /api/projects/:id/updates     | Project updates                |
| GET    | /api/projects/:id/blockers    | Project blockers               |

### Updates (Conversational)
| Method | Endpoint                      | Description                    |
|--------|------------------------------|--------------------------------|
| GET    | /api/updates                  | List updates                   |
| POST   | /api/updates                  | Submit update (AI responds)    |
| GET    | /api/updates/:id              | Single update with messages    |
| POST   | /api/updates/:id/messages     | Continue conversation          |

### Analytics
| Method | Endpoint                          | Description                  |
|--------|----------------------------------|------------------------------|
| GET    | /api/analytics/overview           | Org-wide stats               |
| GET    | /api/analytics/morale             | Morale history by dept       |
| GET    | /api/analytics/project-health     | Health trend (5 weeks)       |
| GET    | /api/analytics/blockers           | Blocker distribution         |
| GET    | /api/analytics/department-activity| Dept activity metrics        |
| GET    | /api/analytics/workload           | Employee workload            |
| GET    | /api/analytics/risk-scores        | AI risk scores per project   |
| GET    | /api/analytics/recommendations    | AI recommendations           |
| GET    | /api/analytics/radar              | Org health radar data        |

### Blockers
| Method | Endpoint           | Description          |
|--------|--------------------|----------------------|
| GET    | /api/blockers       | List blockers        |
| POST   | /api/blockers       | Report blocker       |
| PATCH  | /api/blockers/:id   | Update/resolve       |

### Insights & Activity
| Method | Endpoint                      | Description          |
|--------|------------------------------|----------------------|
| GET    | /api/insights                 | AI insights feed     |
| GET    | /api/insights/activity-feed   | Live activity feed   |

## Project Structure

```
northstar-backend/
├── src/
│   ├── server.js          # Express app entry point
│   ├── db/
│   │   ├── schema.js      # SQLite schema + connection
│   │   └── seed.js        # Demo data seeder
│   ├── middleware/
│   │   ├── auth.js        # JWT authentication + role guards
│   │   └── validate.js    # Request body validation
│   ├── routes/
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── projects.js
│   │   ├── updates.js
│   │   ├── blockers.js
│   │   ├── analytics.js
│   │   └── insights.js
│   └── utils/
│       └── aiEngine.js    # Signal detection + AI response generation
├── data/
│   └── northstar.db       # SQLite database (auto-created on seed)
└── .env
```
