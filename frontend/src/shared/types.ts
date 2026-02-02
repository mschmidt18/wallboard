import type { ThemeValues } from "../admin/theme-types";

export type WidgetType = "calendar" | "photos" | "weather" | "clock" | "notes";

export interface Widget {
  id: number;
  layout_id: number;
  widget_type: WidgetType;
  config: Record<string, unknown>;
  data?: Record<string, unknown> | null;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
}

export interface Layout {
  id: number;
  name: string;
  columns: number;
  row_height: number;
  is_active: boolean;
  theme: ThemeValues;
  widgets: Widget[];
}

export interface LayoutListItem {
  id: number;
  name: string;
  columns: number;
  row_height: number;
  is_active: boolean;
  theme: ThemeValues;
  widget_count: number;
}

export interface Integration {
  id: number;
  provider: string;
  status: string;
  created_at: string;
}

export interface GoogleConnectResponse {
  auth_url: string;
}

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

// --- API input types ---

export interface LayoutCreate {
  name: string;
  columns?: number;
  row_height?: number;
  theme?: ThemeValues;
}

export interface LayoutUpdate {
  name?: string;
  columns?: number;
  row_height?: number;
  theme?: ThemeValues;
}

export interface WidgetCreate {
  widget_type: WidgetType;
  config: Record<string, unknown>;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
}

export interface WidgetUpdate {
  config?: Record<string, unknown>;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
}

export interface WidgetPositionUpdate {
  id: number;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
}

export interface Settings {
  google_client_id: string;
  google_client_secret: string;
  display_refresh_interval: number;
  log_level: string;
}

// --- System ---

export interface VersionResponse {
  commit: string | null;
  commit_short: string | null;
  commit_date: string | null;
  branch: string | null;
}

export interface UpdateCheckResponse {
  up_to_date: boolean | null;
  commits_behind: number | null;
  commits: string[];
  error: string | null;
}

export interface UpdateResponse {
  status: string;
  steps_completed: string[];
  step_failed: string | null;
  fallback_instructions: string | null;
}
