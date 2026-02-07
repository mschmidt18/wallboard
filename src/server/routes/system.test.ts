import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAuthedApp, createTestApp, injectAuth } from '../test/helpers.js'
import type { FastifyInstance } from 'fastify'

// Mock child_process.execSync
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}))

import { execSync } from 'child_process'

const mockExecSync = vi.mocked(execSync)

describe('system routes', () => {
  let app: FastifyInstance
  let cookie: string

  beforeEach(async () => {
    const authed = await createAuthedApp()
    app = authed.app
    cookie = authed.cookie
    mockExecSync.mockReset()
  })

  afterEach(async () => {
    await app.close()
  })

  // --- Version endpoint ---

  describe('GET /api/system/version', () => {
    it('returns git commit info', async () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = cmd as string
        if (cmdStr.includes('rev-parse HEAD')) return 'abc123def456789\n'
        if (cmdStr.includes('rev-parse --short HEAD')) return 'abc123d\n'
        if (cmdStr.includes('log -1 --format=%ci')) return '2025-01-15 10:30:00 -0500\n'
        if (cmdStr.includes('rev-parse --abbrev-ref HEAD')) return 'main\n'
        return ''
      })

      const resp = await injectAuth(app, 'GET', '/api/system/version', undefined, cookie)

      expect(resp.statusCode).toBe(200)
      const data = resp.json()
      expect(data.commit).toBe('abc123def456789')
      expect(data.commit_short).toBe('abc123d')
      expect(data.commit_date).toBe('2025-01-15 10:30:00 -0500')
      expect(data.branch).toBe('main')
    })

    it('returns nulls when git commands fail', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('git failed')
      })

      const resp = await injectAuth(app, 'GET', '/api/system/version', undefined, cookie)

      expect(resp.statusCode).toBe(200)
      const data = resp.json()
      expect(data.commit).toBeNull()
      expect(data.commit_short).toBeNull()
      expect(data.commit_date).toBeNull()
      expect(data.branch).toBeNull()
    })

    it('requires auth', async () => {
      const { app: unauthApp } = await createTestApp()
      const resp = await unauthApp.inject({
        method: 'GET',
        url: '/api/system/version',
      })
      expect(resp.statusCode).toBe(401)
      await unauthApp.close()
    })
  })

  // --- Check-update endpoint ---

  describe('POST /api/system/check-update', () => {
    it('returns up_to_date when no commits behind', async () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = cmd as string
        if (cmdStr.includes('fetch origin')) return ''
        if (cmdStr.includes('rev-list')) return '0\n'
        return ''
      })

      const resp = await injectAuth(app, 'POST', '/api/system/check-update', undefined, cookie)

      expect(resp.statusCode).toBe(200)
      const data = resp.json()
      expect(data.up_to_date).toBe(true)
      expect(data.commits_behind).toBe(0)
      expect(data.commits).toEqual([])
      expect(data.error).toBeNull()
    })

    it('returns commit info when behind', async () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = cmd as string
        if (cmdStr.includes('fetch origin')) return ''
        if (cmdStr.includes('rev-list')) return '3\n'
        if (cmdStr.includes('log --oneline')) return 'abc1234 Fix bug\ndef5678 Add feature\n789abcd Update docs\n'
        return ''
      })

      const resp = await injectAuth(app, 'POST', '/api/system/check-update', undefined, cookie)

      expect(resp.statusCode).toBe(200)
      const data = resp.json()
      expect(data.up_to_date).toBe(false)
      expect(data.commits_behind).toBe(3)
      expect(data.commits).toEqual([
        'abc1234 Fix bug',
        'def5678 Add feature',
        '789abcd Update docs',
      ])
      expect(data.error).toBeNull()
    })

    it('returns error when git fetch fails', async () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = cmd as string
        if (cmdStr.includes('fetch origin')) {
          throw new Error('fetch failed')
        }
        return ''
      })

      const resp = await injectAuth(app, 'POST', '/api/system/check-update', undefined, cookie)

      expect(resp.statusCode).toBe(200)
      const data = resp.json()
      expect(data.error).toBeTruthy()
      expect(typeof data.error).toBe('string')
    })

    it('requires auth', async () => {
      const { app: unauthApp } = await createTestApp()
      const resp = await unauthApp.inject({
        method: 'POST',
        url: '/api/system/check-update',
      })
      expect(resp.statusCode).toBe(401)
      await unauthApp.close()
    })

    it('returns error when rev-list fails', async () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = cmd as string
        if (cmdStr.includes('fetch origin')) return ''
        if (cmdStr.includes('rev-list')) {
          throw new Error('rev-list failed')
        }
        return ''
      })

      const resp = await injectAuth(app, 'POST', '/api/system/check-update', undefined, cookie)

      expect(resp.statusCode).toBe(200)
      const data = resp.json()
      expect(data.up_to_date).toBeNull()
      expect(data.commits_behind).toBeNull()
      expect(data.error).toBe('Failed to determine commits behind')
    })
  })

  // --- Update endpoint ---

  describe('POST /api/system/update', () => {
    it('returns ok when all steps succeed', async () => {
      mockExecSync.mockReturnValue('')

      const resp = await injectAuth(app, 'POST', '/api/system/update', undefined, cookie)

      expect(resp.statusCode).toBe(200)
      const data = resp.json()
      expect(data.status).toBe('ok')
      expect(data.steps_completed).toContain('git pull')
      expect(data.steps_completed).toContain('npm install')
      expect(data.steps_completed).toContain('npm build')
      expect(data.steps_completed).toContain('restart service')
      expect(data.step_failed).toBeNull()
      expect(data.error).toBeNull()
      expect(data.fallback_instructions).toBeNull()
    })

    it('returns error when restart service fails', async () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = cmd as string
        if (cmdStr.includes('systemctl')) {
          throw new Error('systemctl failed')
        }
        return ''
      })

      const resp = await injectAuth(app, 'POST', '/api/system/update', undefined, cookie)

      expect(resp.statusCode).toBe(200)
      const data = resp.json()
      expect(data.status).toBe('error')
      expect(data.step_failed).toBe('restart service')
      expect(data.error).toBeTruthy()
      expect(data.fallback_instructions).toBeTruthy()
      expect(data.steps_completed).toContain('git pull')
      expect(data.steps_completed).toContain('npm install')
      expect(data.steps_completed).toContain('npm build')
    })

    it('returns error when git pull fails', async () => {
      mockExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = cmd as string
        if (cmdStr.includes('git pull')) {
          throw new Error('git pull failed')
        }
        return ''
      })

      const resp = await injectAuth(app, 'POST', '/api/system/update', undefined, cookie)

      expect(resp.statusCode).toBe(200)
      const data = resp.json()
      expect(data.status).toBe('error')
      expect(data.step_failed).toBe('git pull')
      expect(data.error).toBeTruthy()
      expect(data.steps_completed).toEqual([])
      expect(data.fallback_instructions).toBeTruthy()
    })

    it('requires auth', async () => {
      const { app: unauthApp } = await createTestApp()
      const resp = await unauthApp.inject({
        method: 'POST',
        url: '/api/system/update',
      })
      expect(resp.statusCode).toBe(401)
      await unauthApp.close()
    })
  })
})
