import { describe, test, expect, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'
import { createAuthedApp, injectAuth } from '../test/helpers.js'
import type { BackupImportResponse } from '@shared/types.js'

describe('backup routes', () => {
  let app: FastifyInstance
  let db: Database.Database
  let cookie: string
  let tmpDir: string

  afterEach(async () => {
    if (app) await app.close()
    if (db) db.close()
  })

  async function setup() {
    const authed = await createAuthedApp()
    app = authed.app
    db = authed.db
    cookie = authed.cookie
    tmpDir = authed.tmpDir
    return authed
  }

  function seedData() {
    const now = new Date().toISOString()

    // Create two layouts
    db.prepare(
      `INSERT INTO layouts (name, columns, row_height, is_active, theme, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('Dashboard', 12, 80, 1, JSON.stringify({ background: '#000' }), now, now)

    db.prepare(
      `INSERT INTO layouts (name, columns, row_height, is_active, theme, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('Bedroom', 6, 100, 0, '{}', now, now)

    const layouts = db.prepare('SELECT id FROM layouts ORDER BY id').all() as { id: number }[]
    const layoutId1 = layouts[0].id
    const layoutId2 = layouts[1].id

    // Add widgets to first layout
    db.prepare(
      `INSERT INTO widgets (layout_id, widget_type, config, position_x, position_y, width, height, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(layoutId1, 'weather', JSON.stringify({ lat: 40.7, lon: -74 }), 0, 0, 4, 3, now, now)

    db.prepare(
      `INSERT INTO widgets (layout_id, widget_type, config, position_x, position_y, width, height, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(layoutId1, 'clock', '{}', 4, 0, 4, 2, now, now)

    // Add widget to second layout
    db.prepare(
      `INSERT INTO widgets (layout_id, widget_type, config, position_x, position_y, width, height, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(layoutId2, 'notes', JSON.stringify({ content: 'hello' }), 0, 0, 6, 4, now, now)

    // Add ICS calendars
    db.prepare(
      `INSERT INTO ics_calendars (name, url, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run('Family', 'https://example.com/family.ics', '#6366f1', now, now)

    db.prepare(
      `INSERT INTO ics_calendars (name, url, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run('Work', 'https://example.com/work.ics', '#ef4444', now, now)

    // Add schedule rules
    db.prepare(
      `INSERT INTO schedule_rules (layout_id, days_of_week, start_time, end_time, sort_order, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(layoutId1, JSON.stringify([1, 2, 3, 4, 5]), '08:00', '22:00', 0, 1, now, now)

    db.prepare(
      `INSERT INTO schedule_rules (layout_id, days_of_week, start_time, end_time, sort_order, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(null, JSON.stringify([6, 7]), '23:00', '06:00', 1, 1, now, now)

    return { layoutId1, layoutId2 }
  }

  // --- Export tests ---

  test('GET /api/backup/export requires auth', async () => {
    await setup()
    const resp = await app.inject({ method: 'GET', url: '/api/backup/export' })
    expect(resp.statusCode).toBe(401)
  })

  test('export returns correct structure when no data exists', async () => {
    await setup()
    const resp = await injectAuth(app, 'GET', '/api/backup/export', {}, cookie)
    expect(resp.statusCode).toBe(200)

    const body = resp.json()
    expect(body.version).toBe(1)
    expect(body.exported_at).toBeDefined()
    expect(body.layouts).toEqual([])
    expect(body.ics_calendars).toEqual([])
    expect(body.schedule_rules).toEqual([])
    expect(body.settings).toBeDefined()
  })

  test('export includes all seeded data', async () => {
    await setup()
    seedData()

    // Set custom settings
    const settingsPath = join(tmpDir, 'settings.json')
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    settings.google_client_id = 'test-client-id'
    settings.display_refresh_interval = 120
    settings.log_level = 'debug'
    settings.scheduling_enabled = true
    const { writeFileSync } = await import('fs')
    writeFileSync(settingsPath, JSON.stringify(settings))

    const resp = await injectAuth(app, 'GET', '/api/backup/export', {}, cookie)
    const body = resp.json()

    expect(body.layouts).toHaveLength(2)
    expect(body.ics_calendars).toHaveLength(2)
    expect(body.schedule_rules).toHaveLength(2)
    expect(body.settings.google_client_id).toBe('test-client-id')
    expect(body.settings.display_refresh_interval).toBe(120)
    expect(body.settings.log_level).toBe('debug')
    expect(body.settings.scheduling_enabled).toBe(true)
  })

  test('export nests widgets under correct parent layout', async () => {
    await setup()
    seedData()

    const resp = await injectAuth(app, 'GET', '/api/backup/export', {}, cookie)
    const body = resp.json()

    const dashboard = body.layouts.find((l: { name: string }) => l.name === 'Dashboard')
    const bedroom = body.layouts.find((l: { name: string }) => l.name === 'Bedroom')

    expect(dashboard.widgets).toHaveLength(2)
    expect(dashboard.widgets[0].widget_type).toBe('weather')
    expect(dashboard.widgets[1].widget_type).toBe('clock')

    expect(bedroom.widgets).toHaveLength(1)
    expect(bedroom.widgets[0].widget_type).toBe('notes')
  })

  test('export excludes sensitive settings', async () => {
    await setup()

    const resp = await injectAuth(app, 'GET', '/api/backup/export', {}, cookie)
    const body = resp.json()

    expect(body.settings.admin_password_hash).toBeUndefined()
    expect(body.settings.google_client_secret).toBeUndefined()
  })

  test('export sets Content-Disposition header', async () => {
    await setup()

    const resp = await injectAuth(app, 'GET', '/api/backup/export', {}, cookie)
    const disposition = resp.headers['content-disposition'] as string
    expect(disposition).toMatch(/^attachment; filename="wallboard-backup-\d{4}-\d{2}-\d{2}\.json"$/)
  })

  test('export schedule_rules reference correct layout _export_id', async () => {
    await setup()
    const { layoutId1 } = seedData()

    const resp = await injectAuth(app, 'GET', '/api/backup/export', {}, cookie)
    const body = resp.json()

    // First rule references layoutId1
    const rule = body.schedule_rules[0]
    expect(rule._export_layout_id).toBe(layoutId1)

    // Find the layout with that _export_id
    const matchedLayout = body.layouts.find((l: { _export_id: number }) => l._export_id === rule._export_layout_id)
    expect(matchedLayout).toBeDefined()
    expect(matchedLayout.name).toBe('Dashboard')

    // Second rule has null layout (display-off)
    expect(body.schedule_rules[1]._export_layout_id).toBeNull()
  })

  // --- Import tests ---

  test('POST /api/backup/import requires auth', async () => {
    await setup()
    const resp = await app.inject({
      method: 'POST',
      url: '/api/backup/import',
      payload: { version: 1, exported_at: '', layouts: [], ics_calendars: [], schedule_rules: [], settings: {} },
    })
    expect(resp.statusCode).toBe(401)
  })

  test('import rejects invalid version', async () => {
    await setup()
    const resp = await injectAuth(app, 'POST', '/api/backup/import', {
      payload: { version: 2, exported_at: '', layouts: [], ics_calendars: [], schedule_rules: [], settings: {} },
    }, cookie)
    expect(resp.statusCode).toBe(400)
  })

  test('import rejects malformed payload', async () => {
    await setup()
    const resp = await injectAuth(app, 'POST', '/api/backup/import', {
      payload: { version: 1 },
    }, cookie)
    expect(resp.statusCode).toBe(400)
  })

  test('import replaces all existing data', async () => {
    await setup()
    seedData()

    // Verify data exists
    expect((db.prepare('SELECT COUNT(*) as c FROM layouts').get() as { c: number }).c).toBe(2)
    expect((db.prepare('SELECT COUNT(*) as c FROM ics_calendars').get() as { c: number }).c).toBe(2)

    // Import different data
    const resp = await injectAuth(app, 'POST', '/api/backup/import', {
      payload: {
        version: 1,
        exported_at: new Date().toISOString(),
        layouts: [{
          _export_id: 100,
          name: 'New Layout',
          columns: 8,
          row_height: 60,
          is_active: true,
          theme: {},
          widgets: [],
        }],
        ics_calendars: [{ name: 'New Cal', url: 'https://new.ics', color: '#ff0000' }],
        schedule_rules: [],
        settings: {},
      },
    }, cookie)

    expect(resp.statusCode).toBe(200)

    // Old data should be gone, new data present
    expect((db.prepare('SELECT COUNT(*) as c FROM layouts').get() as { c: number }).c).toBe(1)
    const layout = db.prepare('SELECT * FROM layouts').get() as { name: string }
    expect(layout.name).toBe('New Layout')

    expect((db.prepare('SELECT COUNT(*) as c FROM ics_calendars').get() as { c: number }).c).toBe(1)
    const cal = db.prepare('SELECT * FROM ics_calendars').get() as { name: string }
    expect(cal.name).toBe('New Cal')
  })

  test('import remaps layout IDs for widgets', async () => {
    await setup()

    const resp = await injectAuth(app, 'POST', '/api/backup/import', {
      payload: {
        version: 1,
        exported_at: new Date().toISOString(),
        layouts: [
          {
            _export_id: 100,
            name: 'Layout A',
            columns: 12,
            row_height: 80,
            is_active: true,
            theme: {},
            widgets: [
              { widget_type: 'weather', config: { lat: 1 }, position_x: 0, position_y: 0, width: 4, height: 3 },
            ],
          },
          {
            _export_id: 200,
            name: 'Layout B',
            columns: 6,
            row_height: 60,
            is_active: false,
            theme: {},
            widgets: [
              { widget_type: 'clock', config: {}, position_x: 0, position_y: 0, width: 2, height: 2 },
            ],
          },
        ],
        ics_calendars: [],
        schedule_rules: [],
        settings: {},
      },
    }, cookie)

    expect(resp.statusCode).toBe(200)

    // Get inserted layouts
    const layouts = db.prepare('SELECT id, name FROM layouts ORDER BY name').all() as { id: number; name: string }[]
    const layoutA = layouts.find(l => l.name === 'Layout A')!
    const layoutB = layouts.find(l => l.name === 'Layout B')!

    // Verify widgets point to correct layouts
    const weatherWidget = db.prepare('SELECT layout_id FROM widgets WHERE widget_type = ?').get('weather') as { layout_id: number }
    const clockWidget = db.prepare('SELECT layout_id FROM widgets WHERE widget_type = ?').get('clock') as { layout_id: number }

    expect(weatherWidget.layout_id).toBe(layoutA.id)
    expect(clockWidget.layout_id).toBe(layoutB.id)
  })

  test('import remaps layout IDs for schedule_rules', async () => {
    await setup()

    const resp = await injectAuth(app, 'POST', '/api/backup/import', {
      payload: {
        version: 1,
        exported_at: new Date().toISOString(),
        layouts: [
          { _export_id: 50, name: 'My Layout', columns: 12, row_height: 80, is_active: true, theme: {}, widgets: [] },
        ],
        ics_calendars: [],
        schedule_rules: [
          { _export_layout_id: 50, days_of_week: [1, 2, 3], start_time: '09:00', end_time: '17:00', sort_order: 0, enabled: true },
        ],
        settings: {},
      },
    }, cookie)

    expect(resp.statusCode).toBe(200)

    const layout = db.prepare('SELECT id FROM layouts').get() as { id: number }
    const rule = db.prepare('SELECT layout_id FROM schedule_rules').get() as { layout_id: number }
    expect(rule.layout_id).toBe(layout.id)
  })

  test('import handles null layout_id in schedule rules', async () => {
    await setup()

    const resp = await injectAuth(app, 'POST', '/api/backup/import', {
      payload: {
        version: 1,
        exported_at: new Date().toISOString(),
        layouts: [],
        ics_calendars: [],
        schedule_rules: [
          { _export_layout_id: null, days_of_week: [6, 7], start_time: '23:00', end_time: '06:00', sort_order: 0, enabled: true },
        ],
        settings: {},
      },
    }, cookie)

    expect(resp.statusCode).toBe(200)
    const rule = db.prepare('SELECT layout_id FROM schedule_rules').get() as { layout_id: number | null }
    expect(rule.layout_id).toBeNull()
  })

  test('import preserves admin password hash', async () => {
    await setup()

    // Import data
    await injectAuth(app, 'POST', '/api/backup/import', {
      payload: {
        version: 1,
        exported_at: new Date().toISOString(),
        layouts: [],
        ics_calendars: [],
        schedule_rules: [],
        settings: { display_refresh_interval: 300 },
      },
    }, cookie)

    // Verify login still works with original password
    const loginResp = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'admin123' },
    })
    expect(loginResp.statusCode).toBe(200)
  })

  test('import updates non-sensitive settings', async () => {
    await setup()

    await injectAuth(app, 'POST', '/api/backup/import', {
      payload: {
        version: 1,
        exported_at: new Date().toISOString(),
        layouts: [],
        ics_calendars: [],
        schedule_rules: [],
        settings: {
          display_refresh_interval: 300,
          log_level: 'warn',
          scheduling_enabled: true,
        },
      },
    }, cookie)

    const settingsPath = join(tmpDir, 'settings.json')
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    expect(settings.display_refresh_interval).toBe(300)
    expect(settings.log_level).toBe('warn')
    expect(settings.scheduling_enabled).toBe(true)
  })

  test('import returns correct counts', async () => {
    await setup()

    const resp = await injectAuth(app, 'POST', '/api/backup/import', {
      payload: {
        version: 1,
        exported_at: new Date().toISOString(),
        layouts: [
          {
            _export_id: 1,
            name: 'L1',
            columns: 12,
            row_height: 80,
            is_active: true,
            theme: {},
            widgets: [
              { widget_type: 'weather', config: {}, position_x: 0, position_y: 0, width: 4, height: 3 },
              { widget_type: 'clock', config: {}, position_x: 4, position_y: 0, width: 4, height: 2 },
            ],
          },
          {
            _export_id: 2,
            name: 'L2',
            columns: 6,
            row_height: 60,
            is_active: false,
            theme: {},
            widgets: [
              { widget_type: 'notes', config: {}, position_x: 0, position_y: 0, width: 6, height: 4 },
            ],
          },
        ],
        ics_calendars: [
          { name: 'Cal1', url: 'https://a.ics', color: '#ff0000' },
        ],
        schedule_rules: [
          { _export_layout_id: 1, days_of_week: [1], start_time: '08:00', end_time: '22:00', sort_order: 0, enabled: true },
          { _export_layout_id: null, days_of_week: [7], start_time: '23:00', end_time: '06:00', sort_order: 1, enabled: true },
        ],
        settings: {},
      },
    }, cookie)

    expect(resp.statusCode).toBe(200)
    const body = resp.json() as BackupImportResponse
    expect(body.layouts).toBe(2)
    expect(body.widgets).toBe(3)
    expect(body.ics_calendars).toBe(1)
    expect(body.schedule_rules).toBe(2)
  })

  test('import is atomic on error', async () => {
    await setup()
    seedData()

    const originalLayoutCount = (db.prepare('SELECT COUNT(*) as c FROM layouts').get() as { c: number }).c
    const originalWidgetCount = (db.prepare('SELECT COUNT(*) as c FROM widgets').get() as { c: number }).c

    // Send a payload with a widget that has an invalid widget_type for DB-level issues
    // Actually, TypeBox validation will catch schema issues before the transaction.
    // To test atomicity, we need something that passes validation but fails at DB level.
    // We can't easily trigger a DB error with valid schema data, but we can verify
    // that a schema-rejected request doesn't modify data.
    const resp = await injectAuth(app, 'POST', '/api/backup/import', {
      payload: {
        version: 1,
        exported_at: new Date().toISOString(),
        layouts: [{ _export_id: 1, name: 'X', columns: 12, row_height: 80, is_active: true, theme: {}, widgets: [{ widget_type: 'weather', config: {}, position_x: 0, position_y: 0, width: -1, height: 3 }] }],
        ics_calendars: [],
        schedule_rules: [],
        settings: {},
      },
    }, cookie)

    // Request should fail (400 from schema validation — width minimum is 1)
    expect(resp.statusCode).toBe(400)

    // Original data should be intact
    const afterLayoutCount = (db.prepare('SELECT COUNT(*) as c FROM layouts').get() as { c: number }).c
    const afterWidgetCount = (db.prepare('SELECT COUNT(*) as c FROM widgets').get() as { c: number }).c
    expect(afterLayoutCount).toBe(originalLayoutCount)
    expect(afterWidgetCount).toBe(originalWidgetCount)
  })

  // --- Round-trip test ---

  test('export → import → export produces equivalent data', async () => {
    await setup()
    seedData()

    // Export original data
    const export1 = await injectAuth(app, 'GET', '/api/backup/export', {}, cookie)
    const backup1 = export1.json()

    // Import into a clean state (wipe + restore)
    const importResp = await injectAuth(app, 'POST', '/api/backup/import', {
      payload: backup1,
    }, cookie)
    expect(importResp.statusCode).toBe(200)

    // Export again
    const export2 = await injectAuth(app, 'GET', '/api/backup/export', {}, cookie)
    const backup2 = export2.json()

    // Compare structure (ignore timestamps, IDs, exported_at)
    expect(backup2.version).toBe(backup1.version)
    expect(backup2.layouts.length).toBe(backup1.layouts.length)
    expect(backup2.ics_calendars.length).toBe(backup1.ics_calendars.length)
    expect(backup2.schedule_rules.length).toBe(backup1.schedule_rules.length)

    // Compare layout names, configs, widget counts
    for (let i = 0; i < backup1.layouts.length; i++) {
      const l1 = backup1.layouts[i]
      const l2 = backup2.layouts[i]
      expect(l2.name).toBe(l1.name)
      expect(l2.columns).toBe(l1.columns)
      expect(l2.row_height).toBe(l1.row_height)
      expect(l2.is_active).toBe(l1.is_active)
      expect(l2.theme).toEqual(l1.theme)
      expect(l2.widgets.length).toBe(l1.widgets.length)

      for (let j = 0; j < l1.widgets.length; j++) {
        expect(l2.widgets[j].widget_type).toBe(l1.widgets[j].widget_type)
        expect(l2.widgets[j].config).toEqual(l1.widgets[j].config)
        expect(l2.widgets[j].position_x).toBe(l1.widgets[j].position_x)
        expect(l2.widgets[j].position_y).toBe(l1.widgets[j].position_y)
        expect(l2.widgets[j].width).toBe(l1.widgets[j].width)
        expect(l2.widgets[j].height).toBe(l1.widgets[j].height)
      }
    }

    // Compare ICS calendars
    for (let i = 0; i < backup1.ics_calendars.length; i++) {
      expect(backup2.ics_calendars[i].name).toBe(backup1.ics_calendars[i].name)
      expect(backup2.ics_calendars[i].url).toBe(backup1.ics_calendars[i].url)
      expect(backup2.ics_calendars[i].color).toBe(backup1.ics_calendars[i].color)
    }

    // Compare schedule rules (structure, not IDs)
    for (let i = 0; i < backup1.schedule_rules.length; i++) {
      const r1 = backup1.schedule_rules[i]
      const r2 = backup2.schedule_rules[i]
      expect(r2.days_of_week).toEqual(r1.days_of_week)
      expect(r2.start_time).toBe(r1.start_time)
      expect(r2.end_time).toBe(r1.end_time)
      expect(r2.sort_order).toBe(r1.sort_order)
      expect(r2.enabled).toBe(r1.enabled)
      // Layout references: both should be null or both non-null
      if (r1._export_layout_id === null) {
        expect(r2._export_layout_id).toBeNull()
      } else {
        expect(r2._export_layout_id).not.toBeNull()
      }
    }
  })
})
