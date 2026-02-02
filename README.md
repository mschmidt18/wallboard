# Wallboard

A self-hosted digital dashboard for wall-mounted displays. Designed for Raspberry Pi but runs anywhere with Python 3.11+ and Node.js.

Configurable widgets include weather, Google Calendar, Google Photos, clock, and notes. An admin interface lets you create layouts, drag-and-drop widgets onto a grid, connect integrations, and customize themes. The dashboard runs full-screen in a browser and auto-refreshes with cached data.

## Architecture

- **Backend:** FastAPI (Python) with SQLAlchemy ORM and SQLite
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS
- **Display:** Chromium in kiosk mode (Raspberry Pi) or any browser
- **Data:** Background refresh loop caches external data (weather via Open-Meteo, Google Calendar/Photos via OAuth)

In production, FastAPI serves the built React frontend as static files. In development, Vite proxies API requests to the backend.

## Quick Start (Development)

### Prerequisites

- Python 3.11+
- Node.js 20+

### Backend

```bash
python3 -m venv .venv
.venv/bin/pip install -r server/requirements.txt

# Run the server
PYTHONPATH=. .venv/bin/uvicorn server.app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server starts on `http://localhost:5173` and proxies `/api` requests to the backend at `http://localhost:8000`.

### Run Tests

```bash
# Backend tests
PYTHONPATH=. .venv/bin/pytest server/tests/ -v

# Frontend lint
cd frontend && npm run lint
```

## Installation

The install script sets up everything on a Debian-based system (Raspberry Pi OS, Debian 12+, Ubuntu):

```bash
curl -sSL https://raw.githubusercontent.com/OWNER/wallboard/main/install.sh | sudo bash
```

This will:

1. Install system dependencies (Python 3, Node.js 20, Chromium, X server)
2. Create a `wallboard` system user
3. Clone the repository to `/opt/wallboard`
4. Set up a Python virtual environment and install dependencies
5. Build the React frontend
6. Generate a device-specific encryption key for credential storage
7. Install and start systemd services
8. Configure log rotation

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

This builds a Debian 12 container, runs `install.sh --test`, then verifies the full installation (user, directories, venv, database, frontend build, encryption key, health check). On failure the container is preserved for debugging.

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

1. Create a Google Cloud project and enable the Calendar and Photos APIs
2. Create OAuth 2.0 credentials (web application type)
3. Set the redirect URI to `http://<device-ip>:8000/api/integrations/google/callback`
4. Enter the Client ID and Client Secret in the admin UI under Integrations

### Weather

Weather uses the [Open-Meteo API](https://open-meteo.com/) which is free and requires no API key. Configure latitude and longitude in the weather widget settings.

## Database Migrations

Migrations are managed with Alembic:

```bash
# Run migrations (from project root)
PYTHONPATH=. .venv/bin/alembic -c server/alembic.ini upgrade head

# Create a new migration
PYTHONPATH=. .venv/bin/alembic -c server/alembic.ini revision --autogenerate -m "description"
```

## Project Structure

```
wallboard/
├── server/                    # FastAPI backend
│   ├── app/
│   │   ├── main.py            # Entrypoint, lifespan, middleware, SPA serving
│   │   ├── config.py          # Configuration dataclass
│   │   ├── database.py        # SQLAlchemy setup
│   │   ├── models.py          # ORM models (Layout, Widget, Integration, Cache)
│   │   ├── schemas.py         # Pydantic request/response models
│   │   ├── auth.py            # Authentication helpers
│   │   ├── logging.py         # Structured logging (structlog)
│   │   ├── routers/           # API endpoints (/api/*)
│   │   │   ├── layouts.py     # Layout CRUD + activation
│   │   │   ├── widgets.py     # Widget CRUD + batch positioning
│   │   │   ├── display.py     # Merged layout + cached data for display
│   │   │   ├── settings.py    # Auth setup/login/logout, app settings
│   │   │   ├── integrations.py # Google OAuth connect/callback/disconnect
│   │   │   └── google_data.py # Google Calendar/Photos proxy endpoints
│   │   └── services/          # Business logic
│   │       ├── refresh.py     # Background data refresh loop
│   │       ├── weather.py     # Open-Meteo API client
│   │       ├── encryption.py  # Fernet encrypt/decrypt
│   │       ├── google_auth.py # Google OAuth flow
│   │       ├── google_calendar.py
│   │       └── google_photos.py
│   ├── alembic/               # Database migrations
│   ├── tests/                 # pytest test suite
│   ├── alembic.ini
│   └── requirements.txt
├── frontend/                  # React frontend
│   ├── src/
│   │   ├── dashboard/         # Full-screen display route
│   │   │   └── widgets/       # Widget components
│   │   ├── admin/             # Admin configuration UI
│   │   │   └── widget-configs/ # Per-widget config forms
│   │   └── shared/            # API client, types
│   ├── package.json
│   └── vite.config.ts
├── tests/
│   └── test_install.sh        # Post-install verification assertions
├── system/                    # Systemd service files
├── bin/wallboard              # CLI tool
├── install.sh                 # Production installer (Debian-based systems)
├── Dockerfile.test            # Docker image for install testing
├── test-docker.sh             # Orchestration script for Docker install tests
└── CLAUDE.md                  # Development reference
```

## License

Private project.
