import { useEffect, useState, useRef, useCallback, type FormEvent, type ChangeEvent } from "react";
import { api } from "../shared/api";

interface SettingsData {
  google_client_id: string;
  google_client_secret: string;
  display_refresh_interval: number;
  log_level: string;
  scheduling_enabled: boolean;
}

const DEFAULT_SETTINGS: SettingsData = {
  google_client_id: "",
  google_client_secret: "",
  display_refresh_interval: 60,
  log_level: "INFO",
  scheduling_enabled: false,
};

const LOG_LEVELS = ["DEBUG", "INFO", "WARN", "ERROR"];

const REFRESH_OPTIONS = [
  { value: 15, label: "15 seconds" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 120, label: "2 minutes" },
  { value: 300, label: "5 minutes" },
  { value: 600, label: "10 minutes" },
];

type FeedbackState = { type: "success" | "error"; message: string } | null;

interface RefreshSourceStatus {
  key: string;
  type: string;
  status: "pending" | "in_progress" | "completed" | "failed";
}

function formatSourceName(source: RefreshSourceStatus): string {
  if (source.type === "weather") return "Weather";
  if (source.type === "calendar") return "Google Calendar";
  if (source.type === "photos") return "Google Photos";
  if (source.type === "apple_photos") return "Apple Photos";
  if (source.type === "ics_calendar") {
    // key format: ics_calendar_<id>
    return "ICS Calendar";
  }
  return source.key;
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<FeedbackState>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFeedback, setRefreshFeedback] = useState<FeedbackState>(null);
  const [refreshSources, setRefreshSources] = useState<RefreshSourceStatus[]>(
    [],
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [backupFeedback, setBackupFeedback] = useState<FeedbackState>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const data = await api.getSettings();
      setSettings({
        google_client_id: data.google_client_id ?? "",
        google_client_secret: data.google_client_secret ?? "",
        display_refresh_interval: data.display_refresh_interval ?? 60,
        log_level: data.log_level ?? "INFO",
        scheduling_enabled: data.scheduling_enabled ?? false,
      });
    } catch {
      setFeedback({ type: "error", message: "Failed to load settings." });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await api.updateSettings({
        google_client_id: settings.google_client_id,
        google_client_secret: settings.google_client_secret,
        display_refresh_interval: settings.display_refresh_interval,
        log_level: settings.log_level.toLowerCase(),
        scheduling_enabled: settings.scheduling_enabled,
      });
      setFeedback({ type: "success", message: "Settings saved successfully." });
    } catch {
      setFeedback({ type: "error", message: "Failed to save settings." });
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordFeedback(null);

    if (newPassword !== confirmPassword) {
      setPasswordFeedback({
        type: "error",
        message: "New passwords do not match.",
      });
      return;
    }

    if (newPassword.length < 4) {
      setPasswordFeedback({
        type: "error",
        message: "New password must be at least 4 characters.",
      });
      return;
    }

    setChangingPassword(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPasswordFeedback({
        type: "success",
        message: "Password changed successfully.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setPasswordFeedback({
        type: "error",
        message: "Failed to change password. Check your current password.",
      });
    } finally {
      setChangingPassword(false);
    }
  }

  function updateField<K extends keyof SettingsData>(
    key: K,
    value: SettingsData[K],
  ) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const status = await api.getRefreshStatus();
        setRefreshSources(status.sources);
        if (!status.active) {
          stopPolling();
        }
      } catch {
        stopPolling();
      }
    }, 500);
  }, [stopPolling]);

  async function handleForceRefresh() {
    setRefreshing(true);
    setRefreshFeedback(null);
    setRefreshSources([]);
    startPolling();
    try {
      const result = await api.forceRefresh();
      const message =
        result.failed > 0
          ? `Refreshed ${result.refreshed} source(s), ${result.failed} failed.`
          : `Refreshed ${result.refreshed} data source(s).`;
      setRefreshFeedback({ type: "success", message });
    } catch {
      setRefreshFeedback({
        type: "error",
        message: "Failed to refresh data. Check server logs.",
      });
    } finally {
      stopPolling();
      setRefreshing(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setBackupFeedback(null);
    try {
      await api.exportBackup();
      setBackupFeedback({ type: "success", message: "Backup exported successfully." });
    } catch {
      setBackupFeedback({ type: "error", message: "Failed to export backup." });
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (!window.confirm("This will replace all existing layouts, widgets, calendars, and schedule rules. Continue?")) {
      return;
    }

    setImporting(true);
    setBackupFeedback(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = await api.importBackup(data);
      setBackupFeedback({
        type: "success",
        message: `Imported ${result.layouts} layout(s), ${result.widgets} widget(s), ${result.ics_calendars} calendar(s), ${result.schedule_rules} schedule rule(s).`,
      });
    } catch (err) {
      const message = err instanceof SyntaxError
        ? "Invalid JSON file."
        : "Failed to import backup.";
      setBackupFeedback({ type: "error", message });
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500 text-sm">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      <p className="mt-1 text-sm text-gray-500">
        Configure integrations, display behavior, and security.
      </p>

      {/* Settings form */}
      <form onSubmit={handleSaveSettings} className="mt-8 space-y-8">
        {/* Google Integration Section */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
            Google Integration
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Required for Google Calendar and Google Photos widgets.
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="google_client_id"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Client ID
              </label>
              <input
                id="google_client_id"
                type="text"
                value={settings.google_client_id}
                onChange={(e) =>
                  updateField("google_client_id", e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="your-app.apps.googleusercontent.com"
              />
            </div>
            <div>
              <label
                htmlFor="google_client_secret"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Client Secret
              </label>
              <input
                id="google_client_secret"
                type="password"
                value={settings.google_client_secret}
                onChange={(e) =>
                  updateField("google_client_secret", e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Enter client secret"
              />
            </div>
          </div>
        </section>

        {/* Display Section */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
            Display
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Control how the dashboard display behaves.
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="display_refresh_interval"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Refresh Interval
              </label>
              <select
                id="display_refresh_interval"
                value={settings.display_refresh_interval}
                onChange={(e) =>
                  updateField(
                    "display_refresh_interval",
                    parseInt(e.target.value, 10),
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              >
                {REFRESH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">
                How often the dashboard polls for updated data.
              </p>
            </div>
            <div className="pt-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Manual Refresh
              </label>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={handleForceRefresh}
                  disabled={refreshing}
                  className="py-2 px-4 bg-gray-100 text-gray-700 font-medium rounded-md border border-gray-300 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {refreshing ? "Refreshing..." : "Refresh All Data"}
                </button>
                {refreshFeedback && (
                  <p
                    className={`text-sm ${refreshFeedback.type === "success" ? "text-green-600" : "text-red-600"}`}
                  >
                    {refreshFeedback.message}
                  </p>
                )}
              </div>
              {refreshing && refreshSources.length > 0 && (
                <div className="mt-3 text-sm text-gray-600 space-y-1">
                  <p className="font-medium">
                    Refreshing data sources (
                    {
                      refreshSources.filter(
                        (s) =>
                          s.status === "completed" || s.status === "failed",
                      ).length
                    }
                    /{refreshSources.length})...
                  </p>
                  <ul className="ml-1 space-y-0.5">
                    {refreshSources.map((source) => (
                      <li key={source.key} className="flex items-center gap-2">
                        <span className="w-4 text-center">
                          {source.status === "completed" && (
                            <span className="text-green-600">&#10003;</span>
                          )}
                          {source.status === "failed" && (
                            <span className="text-red-600">&#10007;</span>
                          )}
                          {source.status === "in_progress" && (
                            <span className="text-indigo-600 animate-spin inline-block">
                              &#8635;
                            </span>
                          )}
                          {source.status === "pending" && (
                            <span className="text-gray-400">&#183;</span>
                          )}
                        </span>
                        <span
                          className={
                            source.status === "completed"
                              ? "text-gray-500"
                              : source.status === "failed"
                                ? "text-red-600"
                                : ""
                          }
                        >
                          {formatSourceName(source)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-1 text-xs text-gray-400">
                Force refresh all widget data (weather, calendars, photos).
              </p>
            </div>
          </div>
        </section>

        {/* Logging Section */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
            Logging
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Control server log verbosity.
          </p>
          <div className="mt-4">
            <label
              htmlFor="log_level"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Log Level
            </label>
            <select
              id="log_level"
              value={settings.log_level}
              onChange={(e) => updateField("log_level", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            >
              {LOG_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Save button and feedback */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="py-2 px-6 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
          {feedback && (
            <p
              className={`text-sm ${feedback.type === "success" ? "text-green-600" : "text-red-600"}`}
            >
              {feedback.message}
            </p>
          )}
        </div>
      </form>

      {/* Password Change Section (separate form) */}
      <form onSubmit={handleChangePassword} className="mt-10 mb-8">
        <section>
          <h2 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
            Security
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Change your admin password.
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="current_password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Current Password
              </label>
              <input
                id="current_password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Enter current password"
                required
              />
            </div>
            <div>
              <label
                htmlFor="new_password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                New Password
              </label>
              <input
                id="new_password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Enter new password"
                required
              />
            </div>
            <div>
              <label
                htmlFor="confirm_password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Confirm New Password
              </label>
              <input
                id="confirm_password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Confirm new password"
                required
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <button
              type="submit"
              disabled={changingPassword}
              className="py-2 px-6 bg-gray-800 text-white font-medium rounded-md hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {changingPassword ? "Changing..." : "Change Password"}
            </button>
            {passwordFeedback && (
              <p
                className={`text-sm ${passwordFeedback.type === "success" ? "text-green-600" : "text-red-600"}`}
              >
                {passwordFeedback.message}
              </p>
            )}
          </div>
        </section>
      </form>

      {/* Backup & Restore Section */}
      <section className="mt-10 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
          Backup & Restore
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Export your configuration to a JSON file or restore from a previous backup.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="py-2 px-4 bg-gray-100 text-gray-700 font-medium rounded-md border border-gray-300 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {exporting ? "Exporting..." : "Export Config"}
          </button>
          <label
            className={`py-2 px-4 bg-gray-100 text-gray-700 font-medium rounded-md border border-gray-300 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors cursor-pointer ${importing ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {importing ? "Importing..." : "Import Config"}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportFile}
              disabled={importing}
              className="hidden"
            />
          </label>
        </div>
        {backupFeedback && (
          <p
            className={`mt-3 text-sm ${backupFeedback.type === "success" ? "text-green-600" : "text-red-600"}`}
          >
            {backupFeedback.message}
          </p>
        )}
        <p className="mt-2 text-xs text-gray-400">
          Exports layouts, widgets, calendars, schedule rules, and non-sensitive settings. Does not include passwords or API secrets.
        </p>
      </section>
    </div>
  );
}
