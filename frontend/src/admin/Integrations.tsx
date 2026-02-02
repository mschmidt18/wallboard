import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../shared/api";
import type { IcsCalendar, Integration } from "../shared/types";

export default function Integrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // ICS calendar state
  const [icsCalendars, setIcsCalendars] = useState<IcsCalendar[]>([]);
  const [showIcsForm, setShowIcsForm] = useState(false);
  const [icsForm, setIcsForm] = useState({ name: "", url: "", color: "#6366f1" });
  const [icsSaving, setIcsSaving] = useState(false);
  const [editingIcsId, setEditingIcsId] = useState<number | null>(null);

  const justConnected = searchParams.get("connected") === "true";

  const fetchIntegrations = useCallback(async () => {
    try {
      setError(null);
      const data = await api.getIntegrations();
      setIntegrations(data);
    } catch {
      setError("Failed to load integrations.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchIcsCalendars = useCallback(async () => {
    try {
      const data = await api.getIcsCalendars();
      setIcsCalendars(data);
    } catch {
      // Silently fail — ICS section will just be empty
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
    fetchIcsCalendars();
  }, [fetchIntegrations, fetchIcsCalendars]);

  // Clear the ?connected=true param after showing success
  useEffect(() => {
    if (justConnected) {
      const timer = setTimeout(() => {
        setSearchParams({}, { replace: true });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [justConnected, setSearchParams]);

  const google = integrations.find((i) => i.provider === "google");
  const isConnected = google?.status === "connected";

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const { auth_url } = await api.connectGoogle();
      window.location.href = auth_url;
    } catch {
      setError(
        "Failed to start Google connection. Make sure Google Client ID and Secret are configured in Settings."
      );
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Google integration? Calendar and Photos widgets will stop updating.")) {
      return;
    }
    setDisconnecting(true);
    setError(null);
    try {
      await api.disconnectGoogle();
      await fetchIntegrations();
    } catch {
      setError("Failed to disconnect Google integration.");
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleIcsSave() {
    if (!icsForm.name.trim() || !icsForm.url.trim()) return;
    setIcsSaving(true);
    setError(null);
    try {
      if (editingIcsId !== null) {
        await api.updateIcsCalendar(editingIcsId, icsForm);
      } else {
        await api.createIcsCalendar(icsForm);
      }
      setIcsForm({ name: "", url: "", color: "#6366f1" });
      setShowIcsForm(false);
      setEditingIcsId(null);
      await fetchIcsCalendars();
    } catch {
      setError(editingIcsId !== null ? "Failed to update ICS calendar." : "Failed to add ICS calendar.");
    } finally {
      setIcsSaving(false);
    }
  }

  function handleIcsEdit(cal: IcsCalendar) {
    setEditingIcsId(cal.id);
    setIcsForm({ name: cal.name, url: cal.url, color: cal.color });
    setShowIcsForm(true);
  }

  async function handleIcsDelete(cal: IcsCalendar) {
    if (!confirm(`Delete ICS calendar "${cal.name}"?`)) return;
    setError(null);
    try {
      await api.deleteIcsCalendar(cal.id);
      await fetchIcsCalendars();
    } catch {
      setError("Failed to delete ICS calendar.");
    }
  }

  function handleIcsCancel() {
    setShowIcsForm(false);
    setEditingIcsId(null);
    setIcsForm({ name: "", url: "", color: "#6366f1" });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
      <p className="mt-1 text-sm text-gray-600">
        Connect external services to power your dashboard widgets.
      </p>

      {justConnected && (
        <div className="mt-4 rounded-md bg-green-50 border border-green-200 p-4">
          <div className="flex">
            <svg className="h-5 w-5 text-green-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className="ml-3 text-sm font-medium text-green-800">
              Google account connected successfully.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md bg-red-50 border border-red-200 p-4">
          <div className="flex">
            <svg className="h-5 w-5 text-red-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4a1 1 0 102 0V7zm-1 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <p className="ml-3 text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Google Integration Card */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {/* Google icon */}
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-50 border border-gray-200">
                <svg className="h-6 w-6" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900">Google</h3>
                <p className="text-sm text-gray-500">
                  Google Calendar and Google Photos
                </p>
              </div>
            </div>

            {/* Status badge */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                isConnected
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isConnected ? "bg-green-500" : "bg-gray-400"
                }`}
              />
              {isConnected ? "Connected" : "Not connected"}
            </span>
          </div>

          {/* Connection health info */}
          {isConnected && google && (
            <div className="mt-4 rounded-md bg-gray-50 p-4">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="font-medium text-gray-500">Status</dt>
                  <dd className="mt-1 text-gray-900">Active</dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-500">Connected since</dt>
                  <dd className="mt-1 text-gray-900">
                    {new Date(google.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-6 flex items-center gap-3">
            {isConnected ? (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            ) : (
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {connecting ? "Connecting..." : "Connect Google Account"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Setup Instructions */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="p-6">
          <h3 className="text-base font-semibold text-gray-900">Setup Instructions</h3>
          <p className="mt-1 text-sm text-gray-500">
            Before connecting, you need to configure Google OAuth credentials.
          </p>

          <ol className="mt-4 space-y-3 text-sm text-gray-700 list-decimal list-inside">
            <li>
              Go to the{" "}
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                Google Cloud Console
              </a>{" "}
              and create a new project (or select an existing one).
            </li>
            <li>
              Enable the <strong>Google Calendar API</strong> and{" "}
              <strong>Google Photos Library API</strong> under APIs &amp; Services.
            </li>
            <li>
              Create an <strong>OAuth 2.0 Client ID</strong> (Web application type).
              Add your Wallboard URL as an authorized redirect URI:{" "}
              <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">
                {"http://<your-host>:8000/api/integrations/google/callback"}
              </code>
            </li>
            <li>
              Copy the <strong>Client ID</strong> and <strong>Client Secret</strong>{" "}
              into the{" "}
              <a
                href="/admin/settings"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                Settings page
              </a>{" "}
              under Google integration fields.
            </li>
            <li>
              Return here and click <strong>Connect Google Account</strong> to
              authorize access.
            </li>
          </ol>
        </div>
      </div>

      {/* ICS Calendars Section */}
      <div className="mt-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">ICS Calendars</h2>
            <p className="mt-1 text-sm text-gray-600">
              Add external calendars via ICS feed URLs.
            </p>
          </div>
          {!showIcsForm && (
            <button
              onClick={() => setShowIcsForm(true)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Add ICS Calendar
            </button>
          )}
        </div>

        {/* Add/Edit Form */}
        {showIcsForm && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white shadow-sm p-6">
            <h3 className="text-base font-semibold text-gray-900">
              {editingIcsId !== null ? "Edit ICS Calendar" : "Add ICS Calendar"}
            </h3>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="ics-name" className="block text-sm font-medium text-gray-700">
                  Name
                </label>
                <input
                  id="ics-name"
                  type="text"
                  value={icsForm.name}
                  onChange={(e) => setIcsForm({ ...icsForm, name: e.target.value })}
                  placeholder="Work Calendar"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="ics-url" className="block text-sm font-medium text-gray-700">
                  URL
                </label>
                <input
                  id="ics-url"
                  type="url"
                  value={icsForm.url}
                  onChange={(e) => setIcsForm({ ...icsForm, url: e.target.value })}
                  placeholder="https://example.com/calendar.ics"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="ics-color" className="block text-sm font-medium text-gray-700">
                  Color
                </label>
                <div className="mt-1 flex items-center gap-3">
                  <input
                    id="ics-color"
                    type="color"
                    value={icsForm.color}
                    onChange={(e) => setIcsForm({ ...icsForm, color: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded border border-gray-300"
                  />
                  <span className="text-sm text-gray-500 font-mono">{icsForm.color}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleIcsSave}
                  disabled={icsSaving || !icsForm.name.trim() || !icsForm.url.trim()}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {icsSaving ? "Saving..." : editingIcsId !== null ? "Update" : "Add"}
                </button>
                <button
                  onClick={handleIcsCancel}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ICS Calendar List */}
        {icsCalendars.length > 0 ? (
          <div className="mt-4 space-y-3">
            {icsCalendars.map((cal) => (
              <div
                key={cal.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="h-4 w-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cal.color }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{cal.name}</p>
                    <p className="text-xs text-gray-500 truncate max-w-md" title={cal.url}>
                      {cal.url}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  <button
                    onClick={() => handleIcsEdit(cal)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleIcsDelete(cal)}
                    className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          !showIcsForm && (
            <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
              <p className="text-sm text-gray-500">
                No ICS calendars configured. Add one to display external calendar events on your dashboard.
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
