export interface SchoolLunchDay {
  date: string; // ISO YYYY-MM-DD
  entrees: string[];
  vegetables: string[];
}

export function localIsoDate(now: Date): string {
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

/** Today's menu entry, or null when there is no menu today (weekend / no school). */
export function todaysMenu(days: SchoolLunchDay[], now: Date): SchoolLunchDay | null {
  const today = localIsoDate(now);
  const day = days.find((d) => d.date === today);
  return day && day.entrees.length > 0 ? day : null;
}

/** Total text lines the week view renders: one per entree, one for a "No school" day. */
export function weekLineCount(days: SchoolLunchDay[]): number {
  return days.reduce((sum, day) => sum + Math.max(1, day.entrees.length), 0);
}

export function weekdayName(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" });
}

export function monthDay(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
