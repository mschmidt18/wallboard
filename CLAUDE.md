# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wallboard is a self-hosted digital dashboard for wall-mounted displays (e.g., Raspberry Pi). FastAPI backend serves a React frontend as static files. SQLite database at `~/.wallboard/wallboard.db`. The frontend polls `/api/display` which merges the active layout's widgets with cached external data (weather, calendar, photos).

Design spec: `docs/plans/2026-02-01-wallboard-design.md`
Implementation plan: `docs/plans/2026-02-01-wallboard-implementation.md`

## Commands

### Backend

```bash
# Run all backend tests
PYTHONPATH=. .venv/bin/pytest server/tests/ -v

# Run a single test file
PYTHONPATH=. .venv/bin/pytest server/tests/test_layouts.py -v

# Run a single test
PYTHONPATH=. .venv/bin/pytest server/tests/test_layouts.py::test_create_layout -v

# Run server (dev)
PYTHONPATH=. .venv/bin/uvicorn server.app.main:app --reload --host 0.0.0.0 --port 8000

# Install dependencies
.venv/bin/pip install -r server/requirements.txt
```

### Frontend (planned - `frontend/` directory)

```bash
cd frontend && npm install
cd frontend && npm run dev          # Dev server with /api proxy to :8000
cd frontend && npm run build        # Production build to frontend/dist/
```

## Architecture

### Backend (`server/app/`)

**Entrypoint:** `main.py` - FastAPI app with lifespan that initializes the DB and starts the background refresh loop via `asyncio.create_task`.

**Database:** SQLAlchemy ORM with module-level globals in `database.py`. `init_db()` sets `_engine` and `_session_factory`; `get_db()` is a FastAPI dependency that yields sessions. Tests override this via `app.dependency_overrides[database.get_db]`.

**Models** (`models.py`): `Layout` (has many widgets, only one active at a time), `Widget` (positioned on a grid, typed as calendar/photos/weather/clock/notes), `Integration` (stores encrypted OAuth tokens), `Cache` (keyed by source string like `weather_40.7_-74.0` or `google_calendar`).

**Routers** - all prefixed with `/api/`:
- `layouts.py` - CRUD + activate (deactivates others)
- `widgets.py` - CRUD + batch position update for drag-and-drop
- `display.py` - merges active layout's widgets with cached data, resolving cache keys by widget type/config
- `settings.py` - auth setup/login/logout (bcrypt + cookie sessions), settings stored as JSON file at `~/.wallboard/settings.json`
- `integrations.py` - Google OAuth connect/callback/disconnect, tokens encrypted with Fernet
- `google_data.py` - proxy endpoints for Google Calendar/Photos data

**Services** (`services/`):
- `refresh.py` - background loop that scans all widgets, deduplicates data sources, fetches when cache expires. Each source type has a default TTL (weather: 30min, calendar: 5min, photos: 15min).
- `weather.py` - Open-Meteo API (free, no key)
- `google_auth.py`, `google_calendar.py`, `google_photos.py` - Google API integrations
- `encryption.py` - Fernet encrypt/decrypt for credential storage

**Auth model:** `settings.py` router has module-level `_config` and `_sessions` dict. Tests call `settings_router.set_config(config)` and clear `_sessions` between tests. The `require_auth` function checks cookie against in-memory session store.

### Test patterns

- All fixtures in `server/tests/conftest.py`
- `client` fixture: creates in-memory SQLite, overrides `database.get_db` and `database._session_factory`
- `db_session` fixture: raw session for direct DB manipulation in tests
- `tmp_config` fixture: sets up settings router config for auth tests
- Async service tests use `pytest.mark.asyncio` with `unittest.mock.AsyncMock` and `patch`

### Frontend (planned)

React 18 + TypeScript + Vite + Tailwind CSS. Two routes: `/` (full-screen dashboard display) and `/admin/*` (configuration UI). The dashboard polls `/api/display` and renders widgets in a CSS grid. Admin uses `react-grid-layout` for drag-and-drop layout editing. Vite proxies `/api` to the backend in dev mode. In production, FastAPI serves the built frontend from `frontend/dist/`.
