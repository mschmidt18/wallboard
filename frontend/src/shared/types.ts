import type { ThemeValues } from "../admin/ThemeEditor";

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
