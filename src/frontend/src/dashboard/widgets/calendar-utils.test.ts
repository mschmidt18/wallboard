import { describe, it, expect } from "vitest";
import {
  parseEventDate,
  getDayLabel,
  formatTime,
  groupEventsByDay,
  generateWeekGrid,
  getEventsForDate,
  isToday,
  isPast,
} from "./calendar-utils";

interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  calendar_name?: string;
  color?: string;
  all_day: boolean;
}

describe("parseEventDate", () => {
  it("parses all-day date-only strings in local time", () => {
    const event: CalendarEvent = {
      title: "Birthday",
      start: "2026-02-14",
      end: "2026-02-15",
      all_day: true,
    };
    const date = parseEventDate(event);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(1); // February
    expect(date.getDate()).toBe(14);
  });

  it("parses timed events as Date objects", () => {
    const event: CalendarEvent = {
      title: "Meeting",
      start: "2026-02-14T10:00:00Z",
      end: "2026-02-14T11:00:00Z",
      all_day: false,
    };
    const date = parseEventDate(event);
    expect(date instanceof Date).toBe(true);
    expect(date.getTime()).toBe(new Date("2026-02-14T10:00:00Z").getTime());
  });
});

describe("getDayLabel", () => {
  it('returns "Today" for the same date', () => {
    const today = new Date(2026, 1, 15);
    expect(getDayLabel(today, today)).toBe("Today");
  });

  it('returns "Tomorrow" for the next day', () => {
    const today = new Date(2026, 1, 15);
    const tomorrow = new Date(2026, 1, 16);
    expect(getDayLabel(tomorrow, today)).toBe("Tomorrow");
  });

  it("returns formatted date for other days", () => {
    const today = new Date(2026, 1, 15);
    const future = new Date(2026, 1, 18);
    const label = getDayLabel(future, today);
    expect(label).toContain("Feb");
    expect(label).toContain("18");
  });
});

describe("formatTime", () => {
  it("formats a time string with hour and minutes", () => {
    // Use a fixed UTC time and check it produces a time string
    const formatted = formatTime("2026-02-14T15:30:00Z");
    expect(formatted).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/i);
  });
});

describe("groupEventsByDay", () => {
  it("groups events by their day label", () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const events: CalendarEvent[] = [
      { title: "A", start: `${todayStr}T09:00:00`, end: `${todayStr}T10:00:00`, all_day: false },
      { title: "B", start: `${todayStr}T14:00:00`, end: `${todayStr}T15:00:00`, all_day: false },
    ];
    const groups = groupEventsByDay(events);
    expect(groups.get("Today")?.length).toBe(2);
  });

  it("returns empty map for no events", () => {
    const groups = groupEventsByDay([]);
    expect(groups.size).toBe(0);
  });
});

describe("generateWeekGrid", () => {
  // Use a known Wednesday: Feb 18, 2026
  const wednesday = new Date(2026, 1, 18);

  it("returns 1 week (7 dates) starting on Sunday", () => {
    const grid = generateWeekGrid(1, wednesday);
    expect(grid.length).toBe(1);
    expect(grid[0].length).toBe(7);
    // Sunday of the week containing Feb 18 (Wed) is Feb 15
    expect(grid[0][0].getDay()).toBe(0); // Sunday
    expect(grid[0][0].getDate()).toBe(15);
    expect(grid[0][6].getDay()).toBe(6); // Saturday
    expect(grid[0][6].getDate()).toBe(21);
  });

  it("returns 3 weeks (21 dates)", () => {
    const grid = generateWeekGrid(3, wednesday);
    expect(grid.length).toBe(3);
    expect(grid.flat().length).toBe(21);
    // First date is still Sunday Feb 15
    expect(grid[0][0].getDate()).toBe(15);
    // Last date is Saturday Mar 7
    expect(grid[2][6].getMonth()).toBe(2); // March
    expect(grid[2][6].getDate()).toBe(7);
  });

  it("returns 5 weeks (35 dates)", () => {
    const grid = generateWeekGrid(5, wednesday);
    expect(grid.length).toBe(5);
    expect(grid.flat().length).toBe(35);
  });

  it("starts from Sunday of the week containing today", () => {
    // Sunday itself
    const sunday = new Date(2026, 1, 15);
    const grid = generateWeekGrid(1, sunday);
    expect(grid[0][0].getDate()).toBe(15);

    // Saturday
    const saturday = new Date(2026, 1, 21);
    const gridSat = generateWeekGrid(1, saturday);
    expect(gridSat[0][0].getDate()).toBe(15);
  });

  it("handles month boundaries", () => {
    // Jan 31 is a Saturday; Sunday of that week is Jan 25
    const jan31 = new Date(2026, 0, 31);
    const grid = generateWeekGrid(2, jan31);
    expect(grid[0][0].getMonth()).toBe(0); // January
    expect(grid[0][0].getDate()).toBe(25);
    // Second week starts Feb 1
    expect(grid[1][0].getMonth()).toBe(1); // February
    expect(grid[1][0].getDate()).toBe(1);
  });
});

describe("getEventsForDate", () => {
  const events: CalendarEvent[] = [
    { title: "All Day", start: "2026-02-14", end: "2026-02-15", all_day: true },
    { title: "Morning", start: "2026-02-14T09:00:00", end: "2026-02-14T10:00:00", all_day: false },
    { title: "Other Day", start: "2026-02-15T12:00:00", end: "2026-02-15T13:00:00", all_day: false },
  ];

  it("returns only events matching the given date", () => {
    const date = new Date(2026, 1, 14);
    const result = getEventsForDate(events, date);
    expect(result.length).toBe(2);
    expect(result.map((e) => e.title)).toContain("All Day");
    expect(result.map((e) => e.title)).toContain("Morning");
  });

  it("handles all-day events (date-only strings)", () => {
    const date = new Date(2026, 1, 14);
    const result = getEventsForDate(
      [{ title: "All Day", start: "2026-02-14", end: "2026-02-15", all_day: true }],
      date
    );
    expect(result.length).toBe(1);
  });

  it("handles timed events (ISO strings)", () => {
    const date = new Date(2026, 1, 15);
    const result = getEventsForDate(events, date);
    expect(result.length).toBe(1);
    expect(result[0].title).toBe("Other Day");
  });

  it("returns empty array when no events match", () => {
    const date = new Date(2026, 1, 20);
    const result = getEventsForDate(events, date);
    expect(result.length).toBe(0);
  });
});

describe("isToday", () => {
  it("returns true for the same date", () => {
    const today = new Date(2026, 1, 15);
    const sameDay = new Date(2026, 1, 15, 14, 30);
    expect(isToday(sameDay, today)).toBe(true);
  });

  it("returns false for a different date", () => {
    const today = new Date(2026, 1, 15);
    const other = new Date(2026, 1, 16);
    expect(isToday(other, today)).toBe(false);
  });
});

describe("isPast", () => {
  it("returns true for dates before today", () => {
    const today = new Date(2026, 1, 15);
    const yesterday = new Date(2026, 1, 14);
    expect(isPast(yesterday, today)).toBe(true);
  });

  it("returns false for today", () => {
    const today = new Date(2026, 1, 15);
    expect(isPast(today, today)).toBe(false);
  });

  it("returns false for future dates", () => {
    const today = new Date(2026, 1, 15);
    const tomorrow = new Date(2026, 1, 16);
    expect(isPast(tomorrow, today)).toBe(false);
  });
});
