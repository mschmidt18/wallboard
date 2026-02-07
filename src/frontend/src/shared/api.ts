import type {
  DisplayResponse,
  GoogleConnectResponse,
  IcsCalendar,
  IcsCalendarCreate,
  Integration,
  Layout,
  LayoutCreate,
  LayoutListItem,
  LayoutUpdate,
  Settings,
  UpdateCheckResponse,
  UpdateResponse,
  VersionResponse,
  Widget,
  WidgetCreate,
  WidgetPositionUpdate,
  WidgetUpdate,
} from "./types";

const BASE = "/api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: HeadersInit = options?.body
    ? { "Content-Type": "application/json" }
    : {};
  const response = await fetch(`${BASE}${path}`, {
    headers,
    ...options,
  });
  if (!response.ok) {
    let message = `API error: ${response.status}`;
    try {
      const body = await response.json();
      if (body.detail) {
        message = Array.isArray(body.detail)
          ? body.detail.map((e: { msg: string }) => e.msg).join("; ")
          : body.detail;
      }
    } catch {
      // ignore parse errors
    }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export const api = {
  getDisplay: () => request<DisplayResponse>("/display"),
  getLayouts: () => request<LayoutListItem[]>("/layouts"),
  getLayout: (id: number) => request<Layout>(`/layouts/${id}`),
  createLayout: (data: LayoutCreate) =>
    request<Layout>("/layouts", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateLayout: (id: number, data: LayoutUpdate) =>
    request<Layout>(`/layouts/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteLayout: (id: number) =>
    request<void>(`/layouts/${id}`, { method: "DELETE" }),
  activateLayout: (id: number) =>
    request<Layout>(`/layouts/${id}/activate`, { method: "POST" }),
  addWidget: (layoutId: number, data: WidgetCreate) =>
    request<Widget>(`/layouts/${layoutId}/widgets`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateWidget: (id: number, data: WidgetUpdate) =>
    request<Widget>(`/widgets/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteWidget: (id: number) =>
    request<void>(`/widgets/${id}`, { method: "DELETE" }),
  updatePositions: (layoutId: number, positions: WidgetPositionUpdate[]) =>
    request<Widget[]>(`/layouts/${layoutId}/widgets/positions`, {
      method: "PUT",
      body: JSON.stringify(positions),
    }),
  getAuthStatus: () =>
    request<{ setup_required: boolean }>("/auth/status"),
  setup: (password: string) =>
    request<void>("/auth/setup", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  login: (password: string) =>
    request<void>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  getSettings: () => request<Settings>("/settings"),
  updateSettings: (data: Settings) =>
    request<Settings>("/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    }),
  logout: () =>
    request<void>("/auth/logout", { method: "POST" }),
  getIntegrations: () => request<Integration[]>("/integrations"),
  connectGoogle: () =>
    request<GoogleConnectResponse>("/integrations/google/connect", {
      method: "POST",
    }),
  submitGoogleCode: (code: string) =>
    request<{ success: boolean }>("/integrations/google/callback", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  disconnectGoogle: () =>
    request<void>("/integrations/google", { method: "DELETE" }),
  getGoogleCalendars: () =>
    request<{ id: string; name: string; color: string }[]>("/google/calendars"),
  createPhotoPickerSession: () =>
    request<{ session_id: string; picker_uri: string; polling_config: Record<string, unknown> }>("/google/photos/picker-session", {
      method: "POST",
    }),
  pollPhotoPickerSession: (sessionId: string) =>
    request<{ media_items_set: boolean; photos?: { id: string; url: string; mimeType: string }[] }>(`/google/photos/picker-session/${sessionId}`),
  deletePhotoPickerSession: (sessionId: string) =>
    request<void>(`/google/photos/picker-session/${sessionId}`, { method: "DELETE" }),
  getVersion: () => request<VersionResponse>("/system/version"),
  checkUpdate: () =>
    request<UpdateCheckResponse>("/system/check-update", { method: "POST" }),
  runUpdate: () =>
    request<UpdateResponse>("/system/update", { method: "POST" }),
  getIcsCalendars: () => request<IcsCalendar[]>("/ics-calendars"),
  createIcsCalendar: (data: IcsCalendarCreate) =>
    request<IcsCalendar>("/ics-calendars", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateIcsCalendar: (id: number, data: Partial<IcsCalendarCreate>) =>
    request<IcsCalendar>(`/ics-calendars/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteIcsCalendar: (id: number) =>
    request<void>(`/ics-calendars/${id}`, { method: "DELETE" }),
  forceRefresh: () =>
    request<{ status: string; refreshed: number; failed: number }>("/refresh", {
      method: "POST",
    }),
};
