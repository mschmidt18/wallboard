export type WidgetType = "calendar" | "photos" | "weather" | "clock" | "notes";

export interface Widget {
  id: number;
  layout_id: number;
  widget_type: WidgetType;
  config: Record<string, any>;
  data?: Record<string, any> | null;
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
  theme: Record<string, any>;
  widgets: Widget[];
}

export interface LayoutListItem {
  id: number;
  name: string;
  columns: number;
  row_height: number;
  is_active: boolean;
  theme: Record<string, any>;
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
    theme: Record<string, any>;
  };
  widgets: Widget[];
  refresh_interval: number;
}
