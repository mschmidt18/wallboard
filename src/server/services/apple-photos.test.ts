import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  extractAlbumToken,
  isValidICloudAlbumUrl,
  fetchApplePhotos,
} from './apple-photos.js'

// Mock the icloud-shared-album module
vi.mock('icloud-shared-album', () => ({
  getImages: vi.fn(),
}))

import { getImages } from 'icloud-shared-album'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('extractAlbumToken', () => {
  it('extracts token from valid iCloud shared album URL', () => {
    const url = 'https://www.icloud.com/sharedalbum/#B0z5qAGN1JIFd3y'
    expect(extractAlbumToken(url)).toBe('B0z5qAGN1JIFd3y')
  })

  it('extracts token with longer alphanumeric token', () => {
    const url = 'https://www.icloud.com/sharedalbum/#ABC123XYZ789long'
    expect(extractAlbumToken(url)).toBe('ABC123XYZ789long')
  })

  it('returns null for URL without hash', () => {
    const url = 'https://www.icloud.com/sharedalbum/'
    expect(extractAlbumToken(url)).toBeNull()
  })

  it('returns null for URL with empty hash', () => {
    const url = 'https://www.icloud.com/sharedalbum/#'
    expect(extractAlbumToken(url)).toBeNull()
  })

  it('returns null for invalid domain', () => {
    const url = 'https://www.example.com/sharedalbum/#B0z5qAGN1JIFd3y'
    expect(extractAlbumToken(url)).toBeNull()
  })

  it('returns null for non-sharedalbum path', () => {
    const url = 'https://www.icloud.com/photos/#B0z5qAGN1JIFd3y'
    expect(extractAlbumToken(url)).toBeNull()
  })

  it('returns null for malformed URL', () => {
    expect(extractAlbumToken('not-a-url')).toBeNull()
  })
})

describe('isValidICloudAlbumUrl', () => {
  it('returns true for valid iCloud shared album URL', () => {
    expect(isValidICloudAlbumUrl('https://www.icloud.com/sharedalbum/#B0z5qAGN1JIFd3y')).toBe(true)
  })

  it('returns true without www prefix', () => {
    expect(isValidICloudAlbumUrl('https://icloud.com/sharedalbum/#B0z5qAGN1JIFd3y')).toBe(true)
  })

  it('returns false for URL without hash token', () => {
    expect(isValidICloudAlbumUrl('https://www.icloud.com/sharedalbum/')).toBe(false)
  })

  it('returns false for URL with empty hash', () => {
    expect(isValidICloudAlbumUrl('https://www.icloud.com/sharedalbum/#')).toBe(false)
  })

  it('returns false for non-icloud domain', () => {
    expect(isValidICloudAlbumUrl('https://www.example.com/sharedalbum/#B0z5qAGN1JIFd3y')).toBe(false)
  })

  it('returns false for wrong path', () => {
    expect(isValidICloudAlbumUrl('https://www.icloud.com/photos/#B0z5qAGN1JIFd3y')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isValidICloudAlbumUrl('')).toBe(false)
  })

  it('returns false for malformed URL', () => {
    expect(isValidICloudAlbumUrl('not-a-url')).toBe(false)
  })

  it('returns false for http (non-https)', () => {
    expect(isValidICloudAlbumUrl('http://www.icloud.com/sharedalbum/#B0z5qAGN1JIFd3y')).toBe(false)
  })
})

describe('fetchApplePhotos', () => {
  it('returns normalized photo array from valid album', async () => {
    vi.mocked(getImages).mockResolvedValue({
      metadata: { streamName: 'Test Album' },
      photos: [
        {
          photoGuid: 'abc123',
          derivatives: {
            '1024': { checksum: 'ck1', fileSize: 100000, url: 'https://cvws.icloud-content.com/photo1_1024.jpg', width: 1024, height: 768 },
            '2048': { checksum: 'ck2', fileSize: 200000, url: 'https://cvws.icloud-content.com/photo1_2048.jpg', width: 2048, height: 1536 },
          },
          width: 2048,
          height: 1536,
        },
        {
          photoGuid: 'def456',
          derivatives: {
            '1024': { checksum: 'ck3', fileSize: 100000, url: 'https://cvws.icloud-content.com/photo2_1024.jpg', width: 1024, height: 768 },
          },
          width: 1024,
          height: 768,
        },
      ],
    } as never)

    const photos = await fetchApplePhotos('https://www.icloud.com/sharedalbum/#B0z5qAGN1JIFd3y')

    expect(photos).toHaveLength(2)
    expect(photos[0]).toEqual({
      id: 'abc123',
      url: 'https://cvws.icloud-content.com/photo1_2048.jpg',
      width: 2048,
      height: 1536,
    })
    expect(photos[1].id).toBe('def456')
    expect(getImages).toHaveBeenCalledWith('B0z5qAGN1JIFd3y')
  })

  it('throws on invalid URL', async () => {
    await expect(fetchApplePhotos('https://example.com/invalid')).rejects.toThrow('Invalid iCloud shared album URL')
  })

  it('throws on URL with no token', async () => {
    await expect(fetchApplePhotos('https://www.icloud.com/sharedalbum/')).rejects.toThrow('Invalid iCloud shared album URL')
  })

  it('returns empty array when album has no photos', async () => {
    vi.mocked(getImages).mockResolvedValue({
      metadata: { streamName: 'Empty Album' },
      photos: [],
    } as never)

    const photos = await fetchApplePhotos('https://www.icloud.com/sharedalbum/#EmptyAlbum')
    expect(photos).toEqual([])
  })

  it('handles API errors gracefully', async () => {
    vi.mocked(getImages).mockRejectedValue(new Error('Album not found or private'))

    await expect(fetchApplePhotos('https://www.icloud.com/sharedalbum/#PrivateAlbum'))
      .rejects.toThrow('Failed to fetch Apple Photos')
  })

  it('skips photos without derivatives or URLs', async () => {
    vi.mocked(getImages).mockResolvedValue({
      metadata: { streamName: 'Mixed Album' },
      photos: [
        {
          photoGuid: 'good123',
          derivatives: {
            '1024': { checksum: 'ck1', fileSize: 100000, url: 'https://cvws.icloud-content.com/photo.jpg', width: 1024, height: 768 },
          },
          width: 1024,
          height: 768,
        },
        {
          photoGuid: 'bad456',
          derivatives: {},
          width: 1024,
          height: 768,
        },
        {
          photoGuid: 'nourl789',
          derivatives: {
            '1024': { checksum: 'ck2', fileSize: 100000, width: 1024, height: 768 }, // no URL
          },
          width: 1024,
          height: 768,
        },
      ],
    } as never)

    const photos = await fetchApplePhotos('https://www.icloud.com/sharedalbum/#MixedAlbum')

    expect(photos).toHaveLength(1)
    expect(photos[0].id).toBe('good123')
  })

  it('selects largest derivative for URL', async () => {
    vi.mocked(getImages).mockResolvedValue({
      metadata: { streamName: 'Multi Size Album' },
      photos: [
        {
          photoGuid: 'multi123',
          derivatives: {
            '512': { checksum: 'ck1', fileSize: 50000, url: 'https://cvws.icloud-content.com/small.jpg', width: 512, height: 384 },
            '2048': { checksum: 'ck2', fileSize: 200000, url: 'https://cvws.icloud-content.com/large.jpg', width: 2048, height: 1536 },
            '1024': { checksum: 'ck3', fileSize: 100000, url: 'https://cvws.icloud-content.com/medium.jpg', width: 1024, height: 768 },
          },
          width: 2048,
          height: 1536,
        },
      ],
    } as never)

    const photos = await fetchApplePhotos('https://www.icloud.com/sharedalbum/#MultiSize')

    expect(photos[0].url).toBe('https://cvws.icloud-content.com/large.jpg')
    expect(photos[0].width).toBe(2048)
    expect(photos[0].height).toBe(1536)
  })
})
