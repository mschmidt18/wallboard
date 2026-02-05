# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wallboard is a self-hosted digital dashboard for wall-mounted displays (e.g., Raspberry Pi). Single TypeScript package with a Fastify backend serving a React frontend. SQLite database at `~/.wallboard/wallboard.db`. The frontend polls `/api/display` which merges the active layout's widgets with cached external data (weather, calendar, photos).

Design spec: `docs/plans/2026-02-01-wallboard-design.md`
Implementation plan: `docs/plans/2026-02-01-wallboard-implementation.md`

## Commands

```bash
npm run dev              # Start dev server (tsx --watch, Vite HMR on :8000)
npm run build            # Build server (tsc) + frontend (vite)
npm start                # Production server (NODE_ENV=production)
npm test                 # Run tests with vitest (watch mode)
npm run test:coverage    # Run tests with 95% coverage thresholds
npm run lint             # Lint with ESLint
```

### Running specific tests

```bash
npx vitest run src/server/routes/layouts.test.ts          # Single test file
npx vitest run src/server/routes/layouts.test.ts -t "create"  # Single test by name
npx vitest run src/server/db/                              # All tests in a directory
```

### Install Testing (Docker)

```bash
./test-docker.sh                  # Test install.sh in Docker (no display packages)
./test-docker.sh --with-display   # Test including Chromium/X server install
```

## Architecture

Single `package.json` at the root. Path aliases: `@shared/*` → `src/shared/*`, `@server/*` → `src/server/*`.

### Directory Structure

```
src/
  shared/          # Types and constants shared between server and frontend
    types.ts       # TypeBox schemas (request validation) + TypeScript interfaces (responses)
    constants.ts   # DEFAULT_THEME, DEFAULT_TTLS, SESSION_TTL, WIDGET_TYPES
  server/          # Fastify backend
    index.ts       # Production entrypoint (DB init, migrations, listen on :8000)
    app.ts         # buildApp() factory (registers plugins, routes, refresh loop)
    config.ts      # Config class with default() and forTesting() factories
    auth.ts        # hashPassword, verifyPassword, createSessionToken (bcryptjs)
    logging.ts     # Pino logger config (structlog-compatible format)
    vite-dev.ts    # Vite middleware mode for dev (HMR on same port)
    db/
      connection.ts           # createDb, getDb/setDb singleton, createTestDb
      migrations/
        runner.ts             # SQL migration runner (reads .sql files, tracks in _migrations)
        sql/001_initial.sql   # layouts, widgets, integrations, cache tables
        sql/002_ics_calendars.sql
      queries/
        layouts.ts            # CRUD + activate
        widgets.ts            # CRUD + batch position update
        integrations.ts       # list, getByProvider, upsert, delete
        ics-calendars.ts      # CRUD
        cache.ts              # get, getMultiple, upsert, isFresh
    middleware/
      auth.ts            # In-memory session store, requireAuth preHandler hook
      request-logger.ts  # onResponse hook (skips /api/display, /api/health)
      spa.ts             # Production static file serving + SPA fallback
    routes/
      health.ts          # GET /api/health
      settings.ts        # Auth (setup/login/logout/change-password) + settings CRUD
      layouts.ts         # Layout CRUD + activate
      widgets.ts         # Widget CRUD + batch positions + weather geocoding
      ics-calendars.ts   # ICS calendar CRUD
      integrations.ts    # Google OAuth connect/callback/disconnect
      google-data.ts     # Proxy for Google Calendar/Photos APIs
      display.ts         # GET /api/display (merges layout + cache), photo proxy
      system.ts          # Version info, check-update, self-update (git-based)
    services/
      encryption.ts      # AES-256-GCM encryption (Node crypto)
      geocoding.ts       # Zip code → lat/lon via zippopotam.us
      weather.ts         # Open-Meteo API
      google-auth.ts     # OAuth URL, code exchange, token refresh
      google-calendar.ts # Calendar list + events
      google-photos.ts   # Picker session + media items
      ical-service.ts    # ICS feed fetch + parse (node-ical)
      refresh.ts         # Background loop: collect sources, check freshness, fetch stale
    test/
      setup.ts           # Global afterEach to clear sessions
      helpers.ts         # createTestApp, createAuthedApp, injectAuth
  frontend/              # React 19 + Vite 7 + Tailwind CSS 4
    index.html
    src/
      App.tsx
      dashboard/         # Display route (/) with widget components
      admin/             # Admin route (/admin/*) with layout editor, settings, etc.
      shared/            # api.ts, types.ts (re-exports from @shared + local types)
```

### Backend (`src/server/`)

**Framework:** Fastify with `@fastify/cookie`, `@fastify/static`, `@fastify/middie` (dev only). TypeBox for request validation (schemas produce both TypeScript types and JSON Schema).

**Database:** Raw SQL with `better-sqlite3` (synchronous). WAL mode, foreign keys enabled. Migrations run automatically on server start via `runMigrations()`. No ORM.

**Config:** `Config` class with `dbPath`, `secretKeyPath`, `logPath`, `logLevel`, `displayRefreshInterval`. `Config.default()` uses `~/.wallboard/`. `Config.forTesting(tmpDir)` for tests.

**Auth:** bcryptjs for password hashing. In-memory `Map<string, number>` session store (token → expiry). `requireAuth` preHandler reads `session` cookie. Settings stored as JSON file at `~/.wallboard/settings.json` with 0o600 permissions.

**Encryption:** AES-256-GCM using Node `crypto`. Used for storing Google OAuth credentials.

**Background refresh:** `setTimeout`-based loop (prevents overlap). Collects data sources from widgets, deduplicates by cache key, fetches stale sources. TTLs: weather 30min, calendar 5min, photos 50min, ICS 15min.

**Routes** — all prefixed with `/api/`:
- `health.ts` — `GET /api/health` → `{ status: "ok" }`
- `settings.ts` — auth setup/login/logout/change-password, settings GET/PUT
- `layouts.ts` — CRUD + activate (deactivates others)
- `widgets.ts` — CRUD + batch position update + weather zip geocoding
- `ics-calendars.ts` — ICS calendar CRUD
- `integrations.ts` — Google OAuth connect/callback/disconnect
- `google-data.ts` — proxy for Google Calendar list, Photos picker sessions
- `display.ts` — merges active layout with cached data, photo proxy
- `system.ts` — git version info, check-update, self-update

### Test Patterns

- **Runner:** Vitest with 95% coverage thresholds (lines, branches, functions, statements)
- **App creation:** `createTestApp()` builds app with in-memory DB and test config; `createAuthedApp()` adds password setup + login, returns session cookie
- **Request injection:** `app.inject()` for route tests (Fastify's built-in testing, no HTTP server needed); `injectAuth()` helper attaches auth cookie
- **Session cleanup:** Global `afterEach` in `setup.ts` calls `clearSessions()`
- **Mocking:** `vi.mock()` for modules (services, child_process); mock `globalThis.fetch` for HTTP calls; `vi.useFakeTimers()` for time-dependent tests
- **DB tests:** Use `createTestDb()` for in-memory database with migrations applied

### Frontend (`src/frontend/`)

React 19 + TypeScript + Vite 7 + Tailwind CSS 4. Two routes: `/` (full-screen dashboard display) and `/admin/*` (configuration UI). The dashboard polls `/api/display` and renders widgets in a CSS grid. Admin uses `react-grid-layout` for drag-and-drop layout editing. In dev mode, Vite runs as middleware inside Fastify for single-port HMR. In production, Fastify serves the built frontend from `dist/frontend/`.

**Widget components** (`dashboard/widgets/`): `WeatherWidget`, `CalendarWidget`, `PhotosWidget`, `ClockWidget`, `NotesWidget`

**Admin pages** (`admin/`): `AdminShell` (layout wrapper), `Layouts` (CRUD), `LayoutEditor` (drag-and-drop), `WidgetConfig` + per-type configs, `Integrations` (OAuth), `Settings`, `ThemeEditor`, `Login`

**Shared types** (`shared/types.ts`): Re-exports from `@shared/types` and `@shared/constants`. Frontend-specific types (Widget, Layout, DisplayResponse with typed ThemeValues) defined locally.

### Deployment

- `install.sh` — Production installer for Debian-based systems (clones repo, runs `npm install && npm run build`, configures systemd services, generates encryption key)
- `bin/wallboard` — CLI tool (`start`, `stop`, `restart`, `update`, `status`, `logs`)
- `system/wallboard-server.service` — systemd unit for Node.js/Fastify backend (port 8000)
- `system/wallboard-display.service` — systemd unit for Chromium kiosk display
- Database migrations run automatically on server start (no separate migration step)
