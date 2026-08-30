import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAuthedApp, injectAuth, type AuthedTestApp } from '../test/helpers.js'
import { SchoolCafeError } from '../services/schoolcafe.js'

vi.mock('../services/schoolcafe.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/schoolcafe.js')>()
  return {
    ...actual,
    lookupDistrict: vi.fn(),
    fetchServingLines: vi.fn(),
  }
})

import { lookupDistrict, fetchServingLines } from '../services/schoolcafe.js'

describe('schoolcafe routes', () => {
  let testApp: AuthedTestApp

  beforeEach(async () => {
    vi.clearAllMocks()
    testApp = await createAuthedApp()
  })

  afterEach(async () => {
    await testApp.app.close()
  })

  describe('GET /api/schoolcafe/lookup', () => {
    it('returns district lookup result', async () => {
      const lookup = {
        district_id: 550,
        district_name: 'ELIZABETHTOWN AREA SCHOOL DISTRICT',
        schools: [{ id: 'guid-1', name: 'BAINBRIDGE EL SCH', type: 'Elementary' }],
        grades: ['01', '02', 'KG'],
      }
      vi.mocked(lookupDistrict).mockResolvedValue(lookup)

      const resp = await injectAuth(
        testApp.app, 'GET', '/api/schoolcafe/lookup?district=ElizabethtownAreaSD',
        {}, testApp.cookie,
      )

      expect(resp.statusCode).toBe(200)
      expect(resp.json()).toEqual(lookup)
      expect(lookupDistrict).toHaveBeenCalledWith('ElizabethtownAreaSD')
    })

    it('returns 404 when district is not found', async () => {
      vi.mocked(lookupDistrict).mockRejectedValue(new SchoolCafeError('District not found'))

      const resp = await injectAuth(
        testApp.app, 'GET', '/api/schoolcafe/lookup?district=NoSuchDistrict',
        {}, testApp.cookie,
      )

      expect(resp.statusCode).toBe(404)
      expect(resp.json().error).toBe('District not found')
    })

    it('returns 502 when SchoolCafe API is unreachable', async () => {
      vi.mocked(lookupDistrict).mockRejectedValue(new Error('SchoolCafe API error: 503'))

      const resp = await injectAuth(
        testApp.app, 'GET', '/api/schoolcafe/lookup?district=ElizabethtownAreaSD',
        {}, testApp.cookie,
      )

      expect(resp.statusCode).toBe(502)
      expect(resp.json().error).toBe('SchoolCafe lookup failed')
    })

    it('returns 400 when district param is missing', async () => {
      const resp = await injectAuth(testApp.app, 'GET', '/api/schoolcafe/lookup', {}, testApp.cookie)
      expect(resp.statusCode).toBe(400)
    })

    it('requires auth', async () => {
      const resp = await testApp.app.inject({
        method: 'GET',
        url: '/api/schoolcafe/lookup?district=ElizabethtownAreaSD',
      })
      expect(resp.statusCode).toBe(401)
    })
  })

  describe('GET /api/schoolcafe/serving-lines', () => {
    it('returns serving lines for a school and meal type', async () => {
      vi.mocked(fetchServingLines).mockResolvedValue(['Regular', 'Line B'])

      const resp = await injectAuth(
        testApp.app, 'GET', '/api/schoolcafe/serving-lines?school_id=guid-1&meal_type=Lunch',
        {}, testApp.cookie,
      )

      expect(resp.statusCode).toBe(200)
      expect(resp.json()).toEqual({ serving_lines: ['Regular', 'Line B'] })
      expect(fetchServingLines).toHaveBeenCalledWith('guid-1', 'Lunch')
    })

    it('returns 502 when SchoolCafe API is unreachable', async () => {
      vi.mocked(fetchServingLines).mockRejectedValue(new Error('SchoolCafe API error: 500'))

      const resp = await injectAuth(
        testApp.app, 'GET', '/api/schoolcafe/serving-lines?school_id=guid-1&meal_type=Lunch',
        {}, testApp.cookie,
      )

      expect(resp.statusCode).toBe(502)
    })

    it('returns 400 when school_id is missing', async () => {
      const resp = await injectAuth(
        testApp.app, 'GET', '/api/schoolcafe/serving-lines?meal_type=Lunch',
        {}, testApp.cookie,
      )
      expect(resp.statusCode).toBe(400)
    })

    it('requires auth', async () => {
      const resp = await testApp.app.inject({
        method: 'GET',
        url: '/api/schoolcafe/serving-lines?school_id=guid-1&meal_type=Lunch',
      })
      expect(resp.statusCode).toBe(401)
    })
  })
})
