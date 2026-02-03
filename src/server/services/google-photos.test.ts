import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPickerSession,
  getPickerSession,
  getSessionMediaItems,
  deletePickerSession,
} from './google-photos.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

describe('createPickerSession', () => {
  it('creates a picker session and returns session data', async () => {
    const sessionData = {
      id: 'session-123',
      pickerUri: 'https://picker.google.com/abc',
      pollingConfig: { pollInterval: '3s' },
      mediaItemsSet: false,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sessionData,
    });

    const result = await createPickerSession('test-token');

    expect(result.id).toBe('session-123');
    expect(result.pickerUri).toBe('https://picker.google.com/abc');
    expect(result.mediaItemsSet).toBe(false);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toBe('https://photospicker.googleapis.com/v1/sessions');
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
  });

  it('throws on non-200 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    await expect(createPickerSession('bad-token')).rejects.toThrow('Google Photos Picker API error: 403 Forbidden');
  });
});

describe('getPickerSession', () => {
  it('returns session status', async () => {
    const sessionData = {
      id: 'session-123',
      pickerUri: 'https://picker.google.com/abc',
      mediaItemsSet: true,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sessionData,
    });

    const result = await getPickerSession('test-token', 'session-123');

    expect(result.mediaItemsSet).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toBe('https://photospicker.googleapis.com/v1/sessions/session-123');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
  });

  it('throws on non-200 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(getPickerSession('test-token', 'invalid-session')).rejects.toThrow('Google Photos Picker API error: 404 Not Found');
  });
});

describe('getSessionMediaItems', () => {
  it('returns media items from a session', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mediaItems: [
          { id: 'item1', mediaFile: { baseUrl: 'https://lh3.googleusercontent.com/photo1', mimeType: 'image/jpeg' } },
          { id: 'item2', mediaFile: { baseUrl: 'https://lh3.googleusercontent.com/photo2', mimeType: 'image/png' } },
        ],
      }),
    });

    const items = await getSessionMediaItems('test-token', 'session-123');

    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('item1');
    expect(items[0].baseUrl).toBe('https://lh3.googleusercontent.com/photo1');
    expect(items[0].mimeType).toBe('image/jpeg');
    expect(items[1].baseUrl).toBe('https://lh3.googleusercontent.com/photo2');
  });

  it('handles pagination with nextPageToken', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mediaItems: [
            { id: 'item1', mediaFile: { baseUrl: 'https://lh3.googleusercontent.com/photo1', mimeType: 'image/jpeg' } },
          ],
          nextPageToken: 'token_page2',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mediaItems: [
            { id: 'item2', mediaFile: { baseUrl: 'https://lh3.googleusercontent.com/photo2', mimeType: 'image/png' } },
          ],
        }),
      });

    const items = await getSessionMediaItems('test-token', 'session-123');

    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('item1');
    expect(items[1].id).toBe('item2');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('skips items without baseUrl', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mediaItems: [
          { id: 'item1', mediaFile: { baseUrl: 'https://lh3.googleusercontent.com/photo1', mimeType: 'image/jpeg' } },
          { id: 'item2', mediaFile: {} },
          { id: 'item3', mediaFile: { baseUrl: '', mimeType: 'image/png' } },
        ],
      }),
    });

    const items = await getSessionMediaItems('test-token', 'session-123');

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('item1');
  });

  it('throws on non-200 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    await expect(getSessionMediaItems('test-token', 'expired-session')).rejects.toThrow('Google Photos Picker API error: 403 Forbidden');
  });
});

describe('deletePickerSession', () => {
  it('deletes a picker session', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
    });

    await deletePickerSession('test-token', 'session-123');

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toBe('https://photospicker.googleapis.com/v1/sessions/session-123');
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
  });

  it('throws on non-200 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(deletePickerSession('test-token', 'session-123')).rejects.toThrow('Google Photos Picker API error: 500 Internal Server Error');
  });
});
