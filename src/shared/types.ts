import { Type, type Static } from '@sinclair/typebox';

// --- Widget Types ---

export const WIDGET_TYPES = ['calendar', 'photos', 'weather', 'clock', 'notes'] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

// --- Theme ---

export interface ThemeValues {
  background: string;
  text_color: 'light' | 'dark';
  widget_background: 'transparent' | 'semi-transparent' | 'solid';
  font_family: 'system' | 'serif' | 'monospace' | 'rounded';
  font_scale: 'small' | 'medium' | 'large';
}

// --- Hex color pattern ---

const HexColor = Type.String({ pattern: '^#[0-9a-fA-F]{6}$' });

// --- Layout schemas (TypeBox, for Fastify request validation) ---

export const LayoutCreateSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }),
  columns: Type.Integer({ minimum: 1, maximum: 24, default: 12 }),
  row_height: Type.Integer({ minimum: 20, maximum: 500, default: 80 }),
  theme: Type.Record(Type.String(), Type.Unknown(), { default: {} }),
});
export type LayoutCreate = Static<typeof LayoutCreateSchema>;

export const LayoutUpdateSchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  columns: Type.Optional(Type.Integer({ minimum: 1, maximum: 24 })),
  row_height: Type.Optional(Type.Integer({ minimum: 20, maximum: 500 })),
  theme: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});
export type LayoutUpdate = Static<typeof LayoutUpdateSchema>;

// --- Widget schemas ---

export const WidgetCreateSchema = Type.Object({
  widget_type: Type.Union(WIDGET_TYPES.map((t) => Type.Literal(t))),
  config: Type.Record(Type.String(), Type.Unknown(), { default: {} }),
  position_x: Type.Integer({ minimum: 0 }),
  position_y: Type.Integer({ minimum: 0 }),
  width: Type.Integer({ minimum: 1, maximum: 24 }),
  height: Type.Integer({ minimum: 1, maximum: 20 }),
});
export type WidgetCreate = Static<typeof WidgetCreateSchema>;

export const WidgetUpdateSchema = Type.Object({
  config: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  position_x: Type.Optional(Type.Integer({ minimum: 0 })),
  position_y: Type.Optional(Type.Integer({ minimum: 0 })),
  width: Type.Optional(Type.Integer({ minimum: 1, maximum: 24 })),
  height: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
});
export type WidgetUpdate = Static<typeof WidgetUpdateSchema>;

export const WidgetPositionUpdateSchema = Type.Object({
  id: Type.Integer(),
  position_x: Type.Integer({ minimum: 0 }),
  position_y: Type.Integer({ minimum: 0 }),
  width: Type.Integer({ minimum: 1, maximum: 24 }),
  height: Type.Integer({ minimum: 1, maximum: 20 }),
});
export type WidgetPositionUpdate = Static<typeof WidgetPositionUpdateSchema>;

// --- ICS Calendar schemas ---

export const IcsCalendarCreateSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }),
  url: Type.String({ minLength: 1 }),
  color: Type.String({ pattern: '^#[0-9a-fA-F]{6}$', default: '#6366f1' }),
});
export type IcsCalendarCreate = Static<typeof IcsCalendarCreateSchema>;

export const IcsCalendarUpdateSchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  url: Type.Optional(Type.String({ minLength: 1 })),
  color: Type.Optional(HexColor),
});
export type IcsCalendarUpdate = Static<typeof IcsCalendarUpdateSchema>;

// --- Auth schemas ---

export const PasswordBodySchema = Type.Object({
  password: Type.String({ minLength: 1 }),
});
export type PasswordBody = Static<typeof PasswordBodySchema>;

export const ChangePasswordBodySchema = Type.Object({
  current_password: Type.String({ minLength: 1 }),
  new_password: Type.String({ minLength: 1 }),
});
export type ChangePasswordBody = Static<typeof ChangePasswordBodySchema>;

// --- Settings schema ---

export const SettingsUpdateSchema = Type.Object({
  google_client_id: Type.Optional(Type.String()),
  google_client_secret: Type.Optional(Type.String()),
  display_refresh_interval: Type.Optional(Type.Integer()),
});
export type SettingsUpdate = Static<typeof SettingsUpdateSchema>;

// --- Response interfaces (plain types, no validation needed) ---

export interface WidgetResponse {
  id: number;
  layout_id: number;
  widget_type: WidgetType;
  config: Record<string, unknown>;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
}

export interface LayoutResponse {
  id: number;
  name: string;
  columns: number;
  row_height: number;
  is_active: boolean;
  theme: Record<string, unknown>;
  widgets: WidgetResponse[];
  created_at: string;
  updated_at: string;
}

export interface LayoutListItem {
  id: number;
  name: string;
  columns: number;
  row_height: number;
  is_active: boolean;
  theme: Record<string, unknown>;
  widget_count: number;
  created_at: string;
  updated_at: string;
}

export interface DisplayWidgetResponse {
  id: number;
  widget_type: WidgetType;
  config: Record<string, unknown>;
  data: Record<string, unknown> | null;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
}

export interface DisplayResponse {
  layout: {
    id: number;
    name: string;
    columns: number;
    row_height: number;
    theme: Record<string, unknown>;
  };
  widgets: DisplayWidgetResponse[];
  refresh_interval: number;
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

export interface Settings {
  google_client_id: string;
  google_client_secret: string;
  display_refresh_interval: number;
}

export interface IcsCalendar {
  id: number;
  name: string;
  url: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export type IcsCalendarResponse = IcsCalendar;

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

export interface CalendarSource {
  type: 'google' | 'ics';
  id: string | number;
}
