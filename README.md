# Wallboard

A self-hosted digital dashboard for wall-mounted displays. Designed for Raspberry Pi but runs anywhere with Node.js 20+.

Configurable widgets include weather, Google Calendar, Google Photos, clock, and notes. An admin interface lets you create layouts, drag-and-drop widgets onto a grid, connect integrations, and customize themes. The dashboard runs full-screen in a browser and auto-refreshes with cached data.

## Architecture

- **Backend:** Fastify (Node.js/TypeScript) with raw SQL and SQLite (better-sqlite3)
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS
- **Display:** Chromium in kiosk mode (Raspberry Pi) or any browser
- **Data:** Background refresh loop caches external data (weather via Open-Meteo, Google Calendar/Photos via OAuth)

Single TypeScript package with unified build. In development, Vite runs as middleware inside Fastify for single-port HMR. In production, Fastify serves the built React frontend as static files.

## Quick Start (Development)

### Prerequisites

- Node.js 20+

### Install and Run

```bash
npm install
npm run dev
```

The server starts on `http://localhost:8000` with both API and frontend (HMR enabled).

### Run Tests

```bash
npm test                  # Watch mode
npm run test:coverage     # With 95% coverage thresholds
npm run lint              # ESLint
```

### Build for Production

```bash
npm run build    # Compiles server (tsc) + frontend (vite)
npm start        # Runs production server
```

## Installation

The install script sets up everything on a Debian-based system (Raspberry Pi OS, Debian 12+, Ubuntu):

```bash
curl -sSL https://raw.githubusercontent.com/mschmidt18/wallboard/main/install.sh | sudo bash
```

This will:

1. Install system dependencies (Node.js 20, Chromium, X server)
2. Create a `wallboard` system user
3. Clone the repository to `/opt/wallboard`
4. Run `npm install` and `npm run build`
5. Generate a device-specific encryption key for credential storage
6. Install and start systemd services
7. Configure log rotation

After installation, open the admin UI from another device to complete first-time setup:

```
Admin UI:  http://<device-ip>:8000/admin
Dashboard: http://<device-ip>:8000
```

### Testing the Installer

The installer can be tested end-to-end in Docker without affecting your host system:

```bash
./test-docker.sh                  # Basic test (no display packages)
./test-docker.sh --with-display   # Includes Chromium and X server install
```

This builds a Debian 12 container, runs `install.sh --test`, then verifies the full installation (user, directories, database, frontend build, encryption key, health check). On failure the container is preserved for debugging.

## CLI

The `wallboard` CLI manages services on a production installation:

```bash
wallboard start       # Start server and display services
wallboard stop        # Stop services
wallboard restart     # Restart services
wallboard update      # Pull latest code, rebuild, and restart
wallboard status      # Show service status and device IP
wallboard logs        # Show recent server logs
wallboard logs -f     # Follow logs in real time
```

## Configuration

### Data Directory

Wallboard stores its data in `~/.wallboard/`:

- `wallboard.db` - SQLite database
- `settings.json` - Application settings (auth config, etc.)

### Encryption Key

On production installations, the encryption key for OAuth tokens is stored at `/etc/wallboard/secret.key`. The install script generates this automatically.

### Google Integrations

To use Google Calendar and Google Photos widgets:

1. Create a Google Cloud project and enable the Calendar API and Photos Picker API
2. Create OAuth 2.0 credentials (web application type)
3. Set the redirect URI to `http://<device-ip>:8000/api/integrations/google/callback`
4. Enter the Client ID and Client Secret in the admin UI under Integrations

### Weather

Weather uses the [Open-Meteo API](https://open-meteo.com/) which is free and requires no API key. Configure latitude and longitude in the weather widget settings.

## Database Migrations

Migrations run automatically on server start. SQL migration files are in `src/server/db/migrations/sql/` and tracked in a `_migrations` table.

## Project Structure

```
wallboard/
├── src/
│   ├── shared/                # Types and constants (server + frontend)
│   │   ├── types.ts           # TypeBox schemas + response interfaces
│   │   └── constants.ts       # DEFAULT_THEME, TTLs, etc.
│   ├── server/                # Fastify backend
│   │   ├── index.ts           # Entrypoint (DB init, migrations, listen)
│   │   ├── app.ts             # App factory (plugins, routes, refresh loop)
│   │   ├── config.ts          # Configuration class
│   │   ├── auth.ts            # Password hashing, session tokens
│   │   ├── db/
│   │   │   ├── connection.ts  # Database setup (better-sqlite3)
│   │   │   ├── migrations/    # SQL migration runner + .sql files
│   │   │   └── queries/       # Raw SQL query functions
│   │   ├── middleware/        # Auth, request logging, SPA serving
│   │   ├── routes/            # API endpoints (/api/*)
│   │   └── services/          # External APIs, refresh loop, encryption
│   └── frontend/              # React frontend
│       ├── index.html
│       └── src/
│           ├── dashboard/     # Full-screen display route
│           │   └── widgets/   # Widget components
│           ├── admin/         # Admin configuration UI
│           │   └── widget-configs/
│           └── shared/        # API client, types
├── dist/                      # Build output (server + frontend)
├── system/                    # Systemd service files
├── bin/wallboard              # CLI tool
├── install.sh                 # Production installer
├── test-docker.sh             # Docker install test
├── package.json               # Single package for entire project
├── tsconfig.json              # TypeScript config with path aliases
├── vite.config.ts             # Vite config (root: src/frontend)
├── vitest.config.ts           # Test config (95% coverage thresholds)
└── CLAUDE.md                  # Development reference
```

## License

Private project.
