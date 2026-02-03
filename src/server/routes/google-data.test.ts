import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createAuthedApp, injectAuth } from '../test/helpers.js'
import type { AuthedTestApp } from '../test/helpers.js'

// Mock the services at module level
vi.mock('../services/google-auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/google-auth.js')>()
  return {
    ...actual,
    getValidAccessToken: vi.fn(),
  }
})

vi.mock('../services/google-calendar.js', () => ({
  fetchCalendars: vi.fn(),
}))

vi.mock('../services/google-photos.js', () => ({
  createPickerSession: vi.fn(),
  getPickerSession: vi.fn(),
  getSessionMediaItems: vi.fn(),
  deletePickerSession: vi.fn(),
}))

import { getValidAccessToken } from '../services/google-auth.js'
import { fetchCalendars } from '../services/google-calendar.js'
import {
  createPickerSession,
  getPickerSession,
  getSessionMediaItems,
  deletePickerSession,
} from '../services/google-photos.js'

const mockGetValidAccessToken = vi.mocked(getValidAccessToken)
const mockFetchCalendars = vi.mocked(fetchCalendars)
const mockCreatePickerSession = vi.mocked(createPickerSession)
const mockGetPickerSession = vi.mocked(getPickerSession)
const mockGetSessionMediaItems = vi.mocked(getSessionMediaItems)
const mockDeletePickerSession = vi.mocked(deletePickerSession)

describe('Google data routes', () => {
  let testApp: AuthedTestApp

  beforeEach(async () => {
    testApp = await createAuthedApp()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await testApp.app.close()
  })

  describe('GET /api/google/calendars', () => {
    it('returns calendar list', async () => {
      mockGetValidAccessToken.mockResolvedValue('test-access-token')
      mockFetchCalendars.mockResolvedValue([
        { id: 'primary', name: 'My Calendar', color: '#4285f4' },
      ])

      const response = await injectAuth(testApp.app, 'GET', '/api/google/calendars', {}, testApp.cookie)
      expect(response.statusCode).toBe(200)
      const data = response.json()
      expect(data).toHaveLength(1)
      expect(data[0].id).toBe('primary')
      expect(data[0].name).toBe('My Calendar')
      expect(mockFetchCalendars).toHaveBeenCalledWith('test-access-token')
    })

    it('returns 400 when Google not connected', async () => {
      mockGetValidAccessToken.mockResolvedValue(null)

      const response = await injectAuth(testApp.app, 'GET', '/api/google/calendars', {}, testApp.cookie)
      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('Google not connected')
    })

    it('requires auth', async () => {
      const response = await testApp.app.inject({
        method: 'GET',
        url: '/api/google/calendars',
      })
      expect(response.statusCode).toBe(401)
    })
  })

  describe('POST /api/google/photos/picker-session', () => {
    it('creates picker session', async () => {
      mockGetValidAccessToken.mockResolvedValue('test-access-token')
      mockCreatePickerSession.mockResolvedValue({
        id: 'session-abc',
        pickerUri: 'https://picker.google.com/abc',
        pollingConfig: { pollInterval: '3s' },
        mediaItemsSet: false,
      })

      const response = await injectAuth(testApp.app, 'POST', '/api/google/photos/picker-session', {}, testApp.cookie)
      expect(response.statusCode).toBe(200)
      const data = response.json()
      expect(data.session_id).toBe('session-abc')
      expect(data.picker_uri).toBe('https://picker.google.com/abc')
      expect(data.polling_config).toEqual({ pollInterval: '3s' })
      expect(mockCreatePickerSession).toHaveBeenCalledWith('test-access-token')
    })
  })

  describe('GET /api/google/photos/picker-session/:id', () => {
    it('returns completed session with photos', async () => {
      mockGetValidAccessToken.mockResolvedValue('test-access-token')
      mockGetPickerSession.mockResolvedValue({
        id: 'session-abc',
        pickerUri: 'https://picker.google.com/abc',
        mediaItemsSet: true,
      })
      mockGetSessionMediaItems.mockResolvedValue([
        { id: 'item1', baseUrl: 'https://lh3.googleusercontent.com/photo1', mimeType: 'image/jpeg' },
      ])

      const response = await injectAuth(testApp.app, 'GET', '/api/google/photos/picker-session/session-abc', {}, testApp.cookie)
      expect(response.statusCode).toBe(200)
      const data = response.json()
      expect(data.media_items_set).toBe(true)
      expect(data.photos).toHaveLength(1)
      expect(data.photos[0].id).toBe('item1')
      expect(data.photos[0].url).toContain('/api/photos/proxy?url=')
      expect(data.photos[0].mimeType).toBe('image/jpeg')
    })

    it('returns pending session without photos', async () => {
      mockGetValidAccessToken.mockResolvedValue('test-access-token')
      mockGetPickerSession.mockResolvedValue({
        id: 'session-abc',
        pickerUri: 'https://picker.google.com/abc',
        mediaItemsSet: false,
      })

      const response = await injectAuth(testApp.app, 'GET', '/api/google/photos/picker-session/session-abc', {}, testApp.cookie)
      expect(response.statusCode).toBe(200)
      const data = response.json()
      expect(data.media_items_set).toBe(false)
      expect(data.photos).toBeUndefined()
    })
  })

  describe('DELETE /api/google/photos/picker-session/:id', () => {
    it('deletes picker session', async () => {
      mockGetValidAccessToken.mockResolvedValue('test-access-token')
      mockDeletePickerSession.mockResolvedValue(undefined)

      const response = await injectAuth(testApp.app, 'DELETE', '/api/google/photos/picker-session/session-abc', {}, testApp.cookie)
      expect(response.statusCode).toBe(200)
      expect(mockDeletePickerSession).toHaveBeenCalledWith('test-access-token', 'session-abc')
    })

    it('returns 400 when Google not connected', async () => {
      mockGetValidAccessToken.mockResolvedValue(null)

      const response = await injectAuth(testApp.app, 'DELETE', '/api/google/photos/picker-session/session-abc', {}, testApp.cookie)
      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('Google not connected')
    })
  })

  describe('GET /api/google/photos/picker-session/:id error paths', () => {
    it('returns 400 when Google not connected', async () => {
      mockGetValidAccessToken.mockResolvedValue(null)

      const response = await injectAuth(testApp.app, 'GET', '/api/google/photos/picker-session/session-abc', {}, testApp.cookie)
      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('Google not connected')
    })
  })

  describe('POST /api/google/photos/picker-session error paths', () => {
    it('returns 400 when Google not connected', async () => {
      mockGetValidAccessToken.mockResolvedValue(null)

      const response = await injectAuth(testApp.app, 'POST', '/api/google/photos/picker-session', {}, testApp.cookie)
      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('Google not connected')
    })
  })
})
