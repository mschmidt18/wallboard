import type { DisplayResponse, Layout, Widget } from "./types";

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export const api = {
  getDisplay: () => request<DisplayResponse>("/display"),
  getLayouts: () => request<Layout[]>("/layouts"),
  getLayout: (id: number) => request<Layout>(`/layouts/${id}`),
  createLayout: (data: any) =>
    request<Layout>("/layouts", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateLayout: (id: number, data: any) =>
    request<Layout>(`/layouts/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteLayout: (id: number) =>
    request<void>(`/layouts/${id}`, { method: "DELETE" }),
  activateLayout: (id: number) =>
    request<Layout>(`/layouts/${id}/activate`, { method: "POST" }),
  addWidget: (layoutId: number, data: any) =>
    request<Widget>(`/layouts/${layoutId}/widgets`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateWidget: (id: number, data: any) =>
    request<Widget>(`/widgets/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteWidget: (id: number) =>
    request<void>(`/widgets/${id}`, { method: "DELETE" }),
  updatePositions: (layoutId: number, positions: any[]) =>
    request<Widget[]>(`/layouts/${layoutId}/widgets/positions`, {
      method: "PUT",
      body: JSON.stringify(positions),
    }),
  login: (password: string) =>
    request<any>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  getSettings: () => request<any>("/settings"),
};
