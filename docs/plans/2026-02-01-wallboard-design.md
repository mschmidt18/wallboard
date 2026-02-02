# Wallboard Design Document

A self-hosted digital dashboard for wall-mounted displays. Shows a configurable grid of widgets (calendar, photos, weather, clock, notes) with an admin interface for layout management.

## Architecture Overview

Wallboard runs on a dedicated Raspberry Pi connected to a wall-mounted display. A single FastAPI process serves both the REST API and the built React frontend as static files.

- **Database:** SQLite stored at `~/.wallboard/wallboard.db`
- **Display:** Chromium in kiosk mode, pointed at `localhost:8000`
- **Dashboard view (`/`):** full-screen, no browser chrome -- what's on the wall
- **Admin UI (`/admin`):** accessed from any browser on the local network via `http://<device-ip>:8000/admin`

The dashboard view is a passive consumer -- it fetches layout config and widget data from the API and renders it. The admin UI is where all configuration happens. Both are part of the same React app, just different routes.

The backend periodically fetches external data (calendar events, weather, photo URLs) and caches it in SQLite. The dashboard frontend polls the API on a configurable interval (default 60s). The display works even if the internet blips temporarily.

## Feature Versions

### v1

- Google Calendar (multi-calendar support via OAuth)
- Google Photos album slideshow (via OAuth)
- Weather -- current conditions + 7-day forecast (Open-Meteo, no API key required)
- Clock/Date
- Notes (static text/markdown)
- Grid-based drag-and-drop layout editor
- Multiple saved layouts with manual switching
- Per-layout theme configuration
- Admin UI with password authentication
- `wallboard` CLI for management
- Magic install script

### v2

- Apple Calendar (via CalDAV)
- Apple Reminders (via CalDAV)
- Local to-do list widget
- Scheduled layout rotation (time-of-day switching)
- Update from admin UI
- Additional weather providers (OpenWeatherMap, WeatherAPI.com)

## Data Model

### `layouts`

| Column | Type | Description |
|--------|------|-------------|
| id | integer PK | |
| name | text | Display name |
| columns | integer | Grid column count |
| row_height | integer | Row height in pixels |
| is_active | boolean | Only one active at a time |
| theme | JSON | Layout theme settings (see Theme section) |
| created_at | datetime | |
| updated_at | datetime | |

### `widgets`

| Column | Type | Description |
|--------|------|-------------|
| id | integer PK | |
| layout_id | integer FK | References layouts.id |
| widget_type | text | Enum: `calendar`, `photos`, `weather`, `clock`, `notes` |
| config | JSON | Widget-specific configuration |
| position_x | integer | Grid column position |
| position_y | integer | Grid row position |
| width | integer | Grid columns spanned |
| height | integer | Grid rows spanned |
| created_at | datetime | |
| updated_at | datetime | |

**Widget config examples:**

```json
// Calendar
{"calendar_ids": ["abc", "def"], "days_ahead": 7, "show_all_day": true}

// Photos
{"album_id": "xyz", "interval_seconds": 30, "transition": "fade"}

// Weather
{"lat": 40.7, "lon": -74.0, "units": "imperial"}

// Clock
{"timezone": "America/New_York", "format_24h": false}

// Notes
{"content": "Welcome home", "font_size": "large"}
```

### `integrations`

| Column | Type | Description |
|--------|------|-------------|
| id | integer PK | |
| provider | text | Enum: `google`, `apple` |
| credentials | text | Encrypted JSON (OAuth tokens, etc.) |
| status | text | Connection status |
| created_at | datetime | |
| updated_at | datetime | |

### `cache`

Generic cache table for all external data. Adding a new integration never requires a schema migration -- it just writes to this table with a new source key.

| Column | Type | Description |
|--------|------|-------------|
| id | integer PK | |
| source | text | Key, e.g. `google_calendar`, `google_photos_album_xyz`, `weather` |
| data | JSON | Cached response data |
| fetched_at | datetime | |
| expires_at | datetime | |

## Theme Configuration

Each layout stores its own theme settings, so different saved layouts can look completely different. This also enables future scheduled rotation (e.g., bright layout for daytime, dim/dark for nighttime).

**Theme properties (stored in `layouts.theme` JSON column):**

- **Background:** solid color, or a Google Photos album (photo rotates behind widgets)
- **Text color:** light or dark (auto-suggested based on background, overridable)
- **Widget background:** transparent, semi-transparent overlay, or solid card
- **Font family:** pick from 3-4 pre-installed options (sans-serif, serif, monospace)
- **Font scale:** small / medium / large (scales all widget text proportionally)

## API Design

### Settings & Integrations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | App settings (Google client ID presence, configured integrations) |
| PUT | `/api/settings` | Update app settings |
| POST | `/api/integrations/google/connect` | Initiate Google OAuth flow |
| GET | `/api/integrations/google/callback` | OAuth callback |
| DELETE | `/api/integrations/google` | Disconnect Google account |
| GET | `/api/integrations` | List all connected integrations and status |

### Layouts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/layouts` | List all saved layouts |
| POST | `/api/layouts` | Create a new layout |
| GET | `/api/layouts/{id}` | Get layout with all its widgets |
| PUT | `/api/layouts/{id}` | Update layout metadata (name, grid settings, theme) |
| DELETE | `/api/layouts/{id}` | Delete a layout |
| POST | `/api/layouts/{id}/activate` | Set as the active display layout |

### Widgets

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/layouts/{id}/widgets` | Add widget to layout |
| PUT | `/api/widgets/{id}` | Update widget config or position |
| DELETE | `/api/widgets/{id}` | Delete a widget |
| PUT | `/api/layouts/{id}/widgets/positions` | Batch update positions (drag-and-drop save) |

### Display

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/display` | Active layout with fully resolved widget data (config + cached content merged) |

This is the single endpoint the dashboard polls. The backend assembles everything -- layout, widget configs, and cached data from all sources -- into one response.

### Google Data (for admin UI)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/google/calendars` | List available Google calendars |
| GET | `/api/google/photos/albums` | List available Google Photos albums |
| GET | `/api/google/photos/albums/{id}/photos` | List photos in album |

## Frontend Architecture

### Dashboard View (`/`)

- Full-screen, no UI chrome -- just the grid of widgets
- Polls `GET /api/display` on a configurable interval (default 60s)
- Renders widgets into a CSS Grid based on the layout definition
- Handles transitions (photo slideshows, etc.) client-side between polls
- Touch support: tap a calendar event to expand details, swipe photos manually -- works without touch too
- If the API is unreachable, shows last successful response (cached in localStorage)

### Admin UI (`/admin`)

- Standard app layout with sidebar navigation
- **Dashboard page:** shows active layout, quick-switch between layouts
- **Layout editor:** visual grid editor using `react-grid-layout` -- drag to reposition/resize widgets, click a widget to edit its config in a side panel
- **Integrations page:** connect/disconnect Google, see connection status
- **Settings page:** Google credentials, display settings (refresh interval, admin password)

### Widget Components

Each widget type is a React component that receives `config` and `data` as props. Adding a new widget type means:

1. Add a new React component in `frontend/src/dashboard/widgets/`
2. Add a config editor panel for the admin UI
3. Add a backend data fetcher that writes to the `cache` table

No schema changes, no new API endpoints for the display.

### Styling

- Tailwind CSS
- Dashboard view: dark theme by default (configurable via layout theme settings)
- Admin UI: light theme

## Backend Services

### Background Refresh Loop

A single async loop runs inside the FastAPI process using `asyncio`. On startup and then on a recurring interval, it:

1. Checks which widgets exist across all layouts
2. For each unique data source needed, fetches fresh data if the cache is expired
3. Writes results to the `cache` table with an `expires_at` timestamp

Deduplication: if two layouts both use the same calendar, it fetches once.

### Default Refresh Intervals

| Source | Interval |
|--------|----------|
| Google Calendar | 5 minutes |
| Google Photos album list | 1 hour |
| Google Photos URLs within album | 15 minutes |
| Weather | 30 minutes |

All intervals are configurable in settings.

### Google Integration Service

- Handles OAuth token storage and automatic refresh
- Tokens stored encrypted in `integrations` table
- Calendar: fetches events for the next N days, normalizes into `{title, start, end, calendar_name, color}` format
- Photos: fetches album metadata and photo URLs. Google Photos URLs expire after ~60 minutes, so the refresh loop keeps them fresh. The display frontend loads images directly from Google's CDN -- no proxying through the backend.

### Weather Service

- Calls Open-Meteo free API with lat/lon from widget config
- Caches current conditions + 7-day forecast
- No API key required
- Alternative providers documented for future use: OpenWeatherMap (free tier: 1,000 calls/day), WeatherAPI.com (free tier: 1M calls/month)

### Error Handling

If a fetch fails, the cache retains the last good data and the backend logs the error. The display keeps showing stale data rather than going blank. The admin UI shows integration health status (last successful fetch, any errors).

## Security

Designed for a home network device -- not internet-accessible. Security focuses on protecting credentials and preventing casual misconfiguration.

### Implemented

- **Credentials encrypted at rest:** Google OAuth tokens and API keys encrypted in SQLite using a device-specific key generated at install time, stored at `/etc/wallboard/secret.key` with root-only read permissions
- **Admin password:** single password set during first-run setup, hashed with bcrypt, session managed via HTTP-only cookie
- **Minimal OAuth scopes:** read-only calendar, read-only photos -- no write access
- **No secrets in the frontend:** React app never sees raw OAuth tokens or API keys, only talks to the backend API

### Intentionally Omitted

- HTTPS -- local network only, TLS on a Pi with no domain is pain for minimal benefit
- Rate limiting / CORS hardening -- no internet exposure
- CSRF protection -- minimal risk with single-user local app
- Audit logging -- overkill for a home dashboard
- Multi-user accounts / roles -- single-user device

## Logging

Structured JSON logs for application monitoring, viewable via `wallboard logs`.

- **Log location:** `/var/log/wallboard/wallboard.log`
- **Rotation:** handled by `logrotate` (configured by installer), 7-day retention
- **Default level:** `INFO` (configurable to `DEBUG` in settings for troubleshooting)

### What Gets Logged

- Service start/stop
- Background refresh activity at `INFO`: `"Refreshed google_calendar: 12 events"`
- Refresh failures at `ERROR` with details: `"Failed to refresh weather: connection timeout"`
- OAuth token refresh events (success and failure)
- Admin login attempts (success and failure)
- Configuration changes (layout activated, widget added/removed, integration connected/disconnected)

### What Doesn't Get Logged

- Dashboard `/api/display` polls -- just noise
- Cached data contents -- no calendar event titles or photo URLs in logs

## Device Setup & Boot

### OS & Dependencies

Raspberry Pi OS Lite (no desktop environment). Installed by the magic installer:

- Python 3.11+
- Chromium (`chromium-browser`)
- Minimal X server (`xorg`, `openbox`) -- just enough to run Chromium
- Node.js (for building React frontend)

### Systemd Services

**`wallboard-server.service`** -- FastAPI app

- Runs as dedicated `wallboard` user
- Starts after network is up
- Restarts on failure

**`wallboard-display.service`** -- Kiosk browser

- Starts X server + Openbox + Chromium in kiosk mode
- Chromium flags: `--kiosk --noerrdialogs --disable-infobars --no-first-run`
- Points at `http://localhost:8000`
- Disables screen blanking/DPMS
- Depends on `wallboard-server.service`

### First-Run Experience

On first boot, the dashboard view shows a setup screen: "Visit `http://<device-ip>:8000/admin` from another device to get started." The admin UI walks through entering Google credentials, setting an admin password, and creating the first layout.

## CLI (`wallboard`)

Installed to `/usr/local/bin/wallboard` by the installer.

| Command | Description |
|---------|-------------|
| `wallboard start` | Start server + display services |
| `wallboard stop` | Stop both services |
| `wallboard restart` | Restart both services |
| `wallboard update` | Pull latest code, rebuild frontend, restart services |
| `wallboard status` | Show service status, app URL, device IP |
| `wallboard logs` | Tail server logs |
| `wallboard logs --follow` | Live tail server logs |

## Install Script

One-line install:

```bash
curl -sSL https://raw.githubusercontent.com/<owner>/wallboard/main/install.sh | bash
```

The script:

1. Installs system dependencies (Python, Chromium, X server, Node.js)
2. Creates `wallboard` user and directory structure
3. Clones the repo, sets up Python venv, installs pip dependencies
4. Builds the React frontend
5. Generates device-specific encryption key at `/etc/wallboard/secret.key`
6. Installs systemd services
7. Installs the `wallboard` CLI to `/usr/local/bin/wallboard`
8. Configures log rotation
9. Starts services

## Project Structure

```
wallboard/
├── bin/
│   └── wallboard                  # CLI script (bash)
├── install.sh                     # Magic installer
├── server/
│   ├── app/
│   │   ├── main.py                # FastAPI app, startup/shutdown, static file serving
│   │   ├── config.py              # App configuration (paths, defaults)
│   │   ├── database.py            # SQLite connection, migrations
│   │   ├── models.py              # SQLAlchemy models
│   │   ├── routers/
│   │   │   ├── display.py         # GET /api/display
│   │   │   ├── layouts.py         # Layout CRUD + widget management
│   │   │   ├── integrations.py    # OAuth flows, integration status
│   │   │   └── settings.py        # App settings
│   │   ├── services/
│   │   │   ├── google_calendar.py
│   │   │   ├── google_photos.py
│   │   │   ├── weather.py
│   │   │   └── refresh.py         # Background refresh loop
│   │   └── schemas.py             # Pydantic request/response schemas
│   ├── requirements.txt
│   └── alembic/                   # Database migrations
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── dashboard/             # Dashboard view (display mode)
│   │   │   ├── Dashboard.tsx      # Polls /api/display, renders grid
│   │   │   └── widgets/
│   │   │       ├── CalendarWidget.tsx
│   │   │       ├── PhotosWidget.tsx
│   │   │       ├── WeatherWidget.tsx
│   │   │       ├── ClockWidget.tsx
│   │   │       └── NotesWidget.tsx
│   │   ├── admin/                 # Admin UI
│   │   │   ├── AdminLayout.tsx
│   │   │   ├── LayoutEditor.tsx   # Grid editor with react-grid-layout
│   │   │   ├── WidgetConfig.tsx   # Side panel for widget settings
│   │   │   ├── Integrations.tsx
│   │   │   └── Settings.tsx
│   │   └── shared/                # Shared types, API client, theme
│   ├── package.json
│   └── vite.config.ts
├── system/
│   ├── wallboard-server.service
│   └── wallboard-display.service
└── docs/
    └── plans/
```

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, SQLAlchemy, Alembic |
| Frontend | React, TypeScript, Tailwind CSS, Vite, react-grid-layout |
| Database | SQLite |
| Display | Chromium kiosk mode |
| OS | Raspberry Pi OS Lite + minimal X server |
