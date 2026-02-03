import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchIcsEvents } from './ical-service.js';

// Fixed "now" for all tests: Jan 10, 2025 — before all test events
const FAKE_NOW = new Date('2025-01-10T00:00:00Z');

const SIMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
DTSTART:20250115T100000Z
DTEND:20250115T110000Z
SUMMARY:Team Standup
END:VEVENT
BEGIN:VEVENT
DTSTART:20250116T140000Z
DTEND:20250116T150000Z
SUMMARY:Design Review
END:VEVENT
END:VCALENDAR`;

const ALL_DAY_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
DTSTART;VALUE=DATE:20250120
DTEND;VALUE=DATE:20250121
SUMMARY:Company Holiday
END:VEVENT
END:VCALENDAR`;

const RECURRING_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
DTSTART:20250113T090000Z
DTEND:20250113T093000Z
SUMMARY:Daily Scrum
RRULE:FREQ=DAILY;COUNT=10
END:VEVENT
END:VCALENDAR`;

const TIMEZONE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:STANDARD
DTSTART:19701101T020000
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700308T020000
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20250115T100000
DTEND;TZID=America/New_York:20250115T110000
SUMMARY:NYC Meeting
END:VEVENT
END:VCALENDAR`;

const INVALID_ICS = 'This is not valid ICS content at all.';

function mockFetchResponse(text: string, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: () => Promise.resolve(text),
  });
}

describe('ical-service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('parses basic ICS with two events', async () => {
    globalThis.fetch = mockFetchResponse(SIMPLE_ICS);

    const events = await fetchIcsEvents(
      'https://example.com/cal.ics',
      30,
      'Work',
      '#ff5733',
    );

    expect(events).toHaveLength(2);
    const titles = events.map(e => e.title);
    expect(titles).toContain('Team Standup');
    expect(titles).toContain('Design Review');

    for (const event of events) {
      expect(event.calendar_name).toBe('Work');
      expect(event.color).toBe('#ff5733');
      expect(event.all_day).toBe(false);
      expect(event.start).toBeTruthy();
      expect(event.end).toBeTruthy();
    }
  });

  it('handles recurring events with RRULE', async () => {
    globalThis.fetch = mockFetchResponse(RECURRING_ICS);

    const events = await fetchIcsEvents(
      'https://example.com/cal.ics',
      30,
      'Scrum',
      '#6366f1',
    );

    // RRULE FREQ=DAILY;COUNT=10 starting Jan 13 => 10 instances
    expect(events).toHaveLength(10);
    for (const event of events) {
      expect(event.title).toBe('Daily Scrum');
    }
  });

  it('handles all-day events', async () => {
    globalThis.fetch = mockFetchResponse(ALL_DAY_ICS);

    const events = await fetchIcsEvents(
      'https://example.com/cal.ics',
      30,
      'Holidays',
      '#22c55e',
    );

    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.title).toBe('Company Holiday');
    expect(event.all_day).toBe(true);
    // all-day events should have date strings (YYYY-MM-DD), not datetime
    expect(event.start).not.toContain('T');
    expect(event.start).toBe('2025-01-20');
  });

  it('handles timezone events', async () => {
    globalThis.fetch = mockFetchResponse(TIMEZONE_ICS);

    const events = await fetchIcsEvents(
      'https://example.com/cal.ics',
      30,
      'NYC',
      '#0ea5e9',
    );

    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.title).toBe('NYC Meeting');
    expect(event.start).toContain('2025-01-15');
  });

  it('returns empty array for invalid ICS content', async () => {
    globalThis.fetch = mockFetchResponse(INVALID_ICS);

    const events = await fetchIcsEvents(
      'https://example.com/cal.ics',
      7,
      'Bad',
      '#ef4444',
    );

    expect(events).toEqual([]);
  });

  it('follows redirects', async () => {
    const fetchMock = mockFetchResponse(SIMPLE_ICS);
    globalThis.fetch = fetchMock;

    await fetchIcsEvents(
      'https://example.com/cal.ics',
      30,
      'School',
      '#3b82f6',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/cal.ics',
      expect.objectContaining({ redirect: 'follow' }),
    );
  });

  it('throws on network/fetch errors', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    await expect(
      fetchIcsEvents(
        'https://example.com/cal.ics',
        7,
        'Down',
        '#ef4444',
      ),
    ).rejects.toThrow('Connection refused');
  });

  it('throws on non-200 response from ICS feed', async () => {
    globalThis.fetch = mockFetchResponse('', 500);

    await expect(
      fetchIcsEvents(
        'https://example.com/cal.ics',
        7,
        'Broken',
        '#ef4444',
      ),
    ).rejects.toThrow('ICS fetch error: 500 Error');
  });
});
