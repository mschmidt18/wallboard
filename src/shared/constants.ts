import type { ThemeValues } from './types.js';

export const DEFAULT_THEME: ThemeValues = {
  background: '#1a1a2e',
  text_color: 'light',
  widget_background: 'semi-transparent',
  font_family: 'system',
  font_scale: 'medium',
};

/** Default cache TTLs in seconds, keyed by data source type. */
export const DEFAULT_TTLS = {
  weather: 30 * 60,
  calendar: 5 * 60,
  photos: 50 * 60,
  ics_calendar: 15 * 60,
  apple_photos: 2 * 60 * 60,
  school_lunch: 6 * 60 * 60,
} as const;

/** Session expiry in seconds (24 hours). */
export const SESSION_TTL = 86400;
