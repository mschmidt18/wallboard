// Re-export shared types from @shared/types
// Frontend-specific types are defined locally where shapes differ (e.g., ThemeValues instead of Record<string, unknown>)

import type { ThemeValues } from "@shared/types";

export type {
  WidgetType,
  LayoutUpdate,
  WidgetCreate,
  WidgetUpdate,
  WidgetPositionUpdate,
  LayoutListItem,
  Integration,
  GoogleConnectResponse,
  VersionResponse,
  UpdateCheckResponse,
  UpdateResponse,
  IcsCalendar,
  IcsCalendarCreate,
  CalendarSource,
  ThemeValues,
  ScheduleRuleResponse,
  ScheduleRuleCreate,
  ScheduleRuleUpdate,
  ScheduleReorder,
  BackupImportResponse,
} from "@shared/types";

export { DEFAULT_THEME } from "@shared/constants";

// Frontend-specific LayoutCreate: backend applies defaults for columns, row_height, theme
export interface LayoutCreate {
  name: string;
  columns?: number;
  row_height?: number;
  theme?: Record<string, unknown>;
}

// Frontend-specific Settings: includes log_level which the shared type omits
export interface Settings {
  google_client_id: string;
  google_client_secret: string;
  display_refresh_interval: number;
  log_level: string;
  scheduling_enabled: boolean;
}

// Frontend-specific Widget type: server returns WidgetResponse (with timestamps),
// but display endpoint returns data field. This union covers both use cases.
export interface Widget {
  id: number;
  layout_id?: number;
  widget_type: "calendar" | "photos" | "weather" | "clock" | "notes" | "school_lunch";
  config: Record<string, unknown>;
  data?: Record<string, unknown> | null;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  created_at?: string;
  updated_at?: string;
}

// Frontend-specific Layout type: uses ThemeValues (typed) instead of Record<string, unknown>
export interface Layout {
  id: number;
  name: string;
  columns: number;
  row_height: number;
  is_active: boolean;
  theme: ThemeValues;
  widgets: Widget[];
  created_at?: string;
  updated_at?: string;
}

// Frontend-specific DisplayResponse: uses ThemeValues for theme and Widget for widgets
export interface DisplayResponse {
  layout: {
    id: number;
    name: string;
    columns: number;
    row_height: number;
    theme: ThemeValues;
  } | null;
  widgets: Widget[];
  background_photos?: { url: string }[];
  refresh_interval: number;
  display_power: "on" | "off";
}
