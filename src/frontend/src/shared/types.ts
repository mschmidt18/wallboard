// Re-export shared types from @shared/types
// Frontend-specific types are defined locally where shapes differ (e.g., ThemeValues instead of Record<string, unknown>)

import type { ThemeValues } from "@shared/types";

export type {
  WidgetType,
  LayoutCreate,
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
} from "@shared/types";

export { DEFAULT_THEME } from "@shared/constants";

// Frontend-specific Settings: includes log_level which the shared type omits
export interface Settings {
  google_client_id: string;
  google_client_secret: string;
  display_refresh_interval: number;
  log_level: string;
}

// Frontend-specific Widget type: server returns WidgetResponse (with timestamps),
// but display endpoint returns data field. This union covers both use cases.
export interface Widget {
  id: number;
  layout_id?: number;
  widget_type: "calendar" | "photos" | "weather" | "clock" | "notes";
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
  };
  widgets: Widget[];
  refresh_interval: number;
}
