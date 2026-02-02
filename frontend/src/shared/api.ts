import type {
  DisplayResponse,
  GoogleConnectResponse,
  Integration,
  Layout,
  LayoutCreate,
  LayoutListItem,
  LayoutUpdate,
  Settings,
  Widget,
  WidgetCreate,
  WidgetPositionUpdate,
  WidgetUpdate,
} from "./types";

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
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
    throw new Error(message);
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
  disconnectGoogle: () =>
    request<void>("/integrations/google", { method: "DELETE" }),
  getGoogleCalendars: () =>
    request<{ id: string; name: string; color: string }[]>("/google/calendars"),
  getGooglePhotoAlbums: () =>
    request<{ id: string; title: string; count: number }[]>("/google/photos/albums"),
};
