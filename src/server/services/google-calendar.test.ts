import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchCalendars, fetchEvents } from './google-calendar.js';

describe('google-calendar', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T12:00:00Z'));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  describe('fetchCalendars', () => {
    it('returns calendar list with id, name, and color', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            { id: 'primary', summary: 'My Calendar', backgroundColor: '#4285f4' },
            { id: 'other', summary: 'Work', backgroundColor: '#0b8043' },
          ],
        }),
      });

      const calendars = await fetchCalendars('test-token');

      expect(calendars).toEqual([
        { id: 'primary', name: 'My Calendar', color: '#4285f4' },
        { id: 'other', name: 'Work', color: '#0b8043' },
      ]);

      // Verify auth header
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        }),
      );
    });

    it('throws on non-200 response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(fetchCalendars('bad-token')).rejects.toThrow();
    });

    it('handles empty calendar list', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      });

      const calendars = await fetchCalendars('test-token');
      expect(calendars).toEqual([]);
    });
  });

  describe('fetchEvents', () => {
    it('returns events from multiple calendars with correct fields', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          items: [
            {
              summary: 'Team Meeting',
              start: { dateTime: '2026-02-01T10:00:00-05:00' },
              end: { dateTime: '2026-02-01T11:00:00-05:00' },
            },
            {
              summary: 'All Day Event',
              start: { date: '2026-02-02' },
              end: { date: '2026-02-03' },
            },
          ],
        }),
      };

      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const events = await fetchEvents('test-token', ['primary'], 7);

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        title: 'Team Meeting',
        start: '2026-02-01T10:00:00-05:00',
        end: '2026-02-01T11:00:00-05:00',
        calendar_id: 'primary',
        color: '',
        all_day: false,
      });
      expect(events[1]).toEqual({
        title: 'All Day Event',
        start: '2026-02-02',
        end: '2026-02-03',
        calendar_id: 'primary',
        color: '',
        all_day: true,
      });

      // Verify URL-encoded calendar ID and time params
      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toContain('/calendars/primary/events');
      expect(url).toContain('timeMin=');
      expect(url).toContain('timeMax=');
      expect(url).toContain('singleEvents=true');
      expect(url).toContain('orderBy=startTime');
    });

    it('URL-encodes calendar IDs', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      });

      await fetchEvents('test-token', ['user@example.com'], 7);

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toContain('/calendars/user%40example.com/events');
    });

    it('fetches from multiple calendars', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              summary: 'Event',
              start: { dateTime: '2026-02-01T10:00:00Z' },
              end: { dateTime: '2026-02-01T11:00:00Z' },
            },
          ],
        }),
      });

      const events = await fetchEvents('test-token', ['cal1', 'cal2'], 7);

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(events).toHaveLength(2);
      expect(events[0].calendar_id).toBe('cal1');
      expect(events[1].calendar_id).toBe('cal2');
    });

    it('handles events with no title', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              start: { dateTime: '2026-02-01T10:00:00Z' },
              end: { dateTime: '2026-02-01T11:00:00Z' },
            },
          ],
        }),
      });

      const events = await fetchEvents('test-token', ['primary'], 7);
      expect(events[0].title).toBe('(No title)');
    });

    it('throws on non-200 response for fetchEvents', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      await expect(fetchEvents('bad-token', ['primary'], 7)).rejects.toThrow(
        'Google Calendar API error: 403 Forbidden',
      );
    });

    it('handles calendar with missing summary/backgroundColor', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [{ id: 'cal1' }],
        }),
      });

      const calendars = await fetchCalendars('test-token');
      expect(calendars[0]).toEqual({ id: 'cal1', name: '', color: '' });
    });

    it('handles missing items array in events response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const events = await fetchEvents('test-token', ['primary'], 7);
      expect(events).toEqual([]);
    });
  });
});
