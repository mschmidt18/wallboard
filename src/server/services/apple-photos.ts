import { getImages } from 'icloud-shared-album'

export interface ApplePhoto {
  id: string
  url: string
  width: number
  height: number
}

interface Derivative {
  checksum: string
  fileSize: number
  width: number
  height: number
  url?: string
}

interface ICloudImage {
  photoGuid: string
  derivatives: Record<string, Derivative>
  width: number
  height: number
}

interface ICloudResponse {
  metadata: { streamName: string }
  photos: ICloudImage[]
}

/**
 * Extract the album token from an iCloud shared album URL.
 * Example URL: https://www.icloud.com/sharedalbum/#B0z5qAGN1JIFd3y
 * Returns null if URL is invalid or has no token.
 */
export function extractAlbumToken(url: string): string | null {
  try {
    const parsed = new URL(url)

    // Must be icloud.com domain
    if (!parsed.hostname.endsWith('icloud.com')) {
      return null
    }

    // Must be sharedalbum path
    if (!parsed.pathname.includes('/sharedalbum')) {
      return null
    }

    // Extract hash (token comes after #)
    const hash = parsed.hash
    if (!hash || hash === '#' || hash.length < 2) {
      return null
    }

    return hash.slice(1) // Remove the # prefix
  } catch {
    return null
  }
}

/**
 * Validate if a URL is a valid iCloud shared album URL.
 */
export function isValidICloudAlbumUrl(url: string): boolean {
  try {
    const parsed = new URL(url)

    // Must be https
    if (parsed.protocol !== 'https:') {
      return false
    }

    // Must be icloud.com domain
    if (!parsed.hostname.endsWith('icloud.com')) {
      return false
    }

    // Must be sharedalbum path
    if (!parsed.pathname.includes('/sharedalbum')) {
      return false
    }

    // Must have a non-empty hash token
    const token = extractAlbumToken(url)
    return token !== null && token.length > 0
  } catch {
    return false
  }
}

/**
 * Fetch photos from an iCloud shared album URL.
 * Returns normalized photo array with id, url, width, height.
 */
export async function fetchApplePhotos(albumUrl: string): Promise<ApplePhoto[]> {
  const token = extractAlbumToken(albumUrl)
  if (!token) {
    throw new Error('Invalid iCloud shared album URL')
  }

  let response: ICloudResponse
  try {
    response = await getImages(token) as ICloudResponse
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to fetch Apple Photos: ${message}`)
  }

  const photos: ApplePhoto[] = []

  for (const image of response.photos) {
    const derivatives = image.derivatives
    if (!derivatives || Object.keys(derivatives).length === 0) {
      continue
    }

    // Find the largest derivative with a URL
    let largestKey: string | null = null
    let largestWidth = 0

    for (const [key, derivative] of Object.entries(derivatives)) {
      if (derivative.url && derivative.width > largestWidth) {
        largestWidth = derivative.width
        largestKey = key
      }
    }

    if (largestKey && derivatives[largestKey]?.url) {
      const best = derivatives[largestKey]
      photos.push({
        id: image.photoGuid,
        url: best.url!,
        width: best.width,
        height: best.height,
      })
    }
  }

  return photos
}
