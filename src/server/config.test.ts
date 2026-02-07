import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import { Config } from './config.js'

describe('Config', () => {
  it('default() returns paths under ~/.wallboard/', () => {
    const config = Config.default()
    const wallboardDir = join(homedir(), '.wallboard')

    expect(config.dbPath).toBe(join(wallboardDir, 'wallboard.db'))
    expect(config.secretKeyPath).toBe(join(wallboardDir, 'secret.key'))
    expect(config.logLevel).toBe('INFO')
    expect(config.displayRefreshInterval).toBe(60)
  })

  it('forTesting() returns paths under the given tmpDir', () => {
    const tmpDir = join(tmpdir(), 'wallboard-test-config')
    const config = Config.forTesting(tmpDir)

    expect(config.dbPath).toBe(join(tmpDir, 'test.db'))
    expect(config.secretKeyPath).toBe(join(tmpDir, 'secret.key'))
    expect(config.logLevel).toBe('INFO')
    expect(config.displayRefreshInterval).toBe(60)
  })

  it('constructor accepts custom values', () => {
    const config = new Config({
      dbPath: '/custom/db.sqlite',
      secretKeyPath: '/custom/key',
      logLevel: 'DEBUG',
      displayRefreshInterval: 120,
    })

    expect(config.dbPath).toBe('/custom/db.sqlite')
    expect(config.secretKeyPath).toBe('/custom/key')
    expect(config.logLevel).toBe('DEBUG')
    expect(config.displayRefreshInterval).toBe(120)
  })
})
