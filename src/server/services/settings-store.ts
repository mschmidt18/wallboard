import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'fs'
import { dirname, join } from 'path'

export const DEFAULT_SETTINGS = {
  admin_password_hash: '',
  google_client_id: '',
  google_client_secret: '',
  display_refresh_interval: 60,
  log_level: 'info',
  scheduling_enabled: false,
}

export function settingsPath(config: { dbPath: string }): string {
  return join(dirname(config.dbPath), 'settings.json')
}

export function loadSettings(config: { dbPath: string }): Record<string, unknown> {
  const path = settingsPath(config)
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf-8'))
  }
  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(config: { dbPath: string }, settings: Record<string, unknown>): void {
  const path = settingsPath(config)
  const dir = dirname(path)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(path, JSON.stringify(settings, null, 2))
  chmodSync(path, 0o600)
}
