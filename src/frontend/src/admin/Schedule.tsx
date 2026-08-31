import { useEffect, useState, useCallback } from "react";
import { api } from "../shared/api";
import type {
  ScheduleRuleResponse,
  ScheduleRuleCreate,
  LayoutListItem,
  Settings,
} from "../shared/types";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatDays(days: number[]): string {
  const sorted = [...days].sort();
  if (sorted.length === 7) return "Every day";
  if (
    sorted.length === 5 &&
    sorted.every((d, i) => d === i + 1)
  )
    return "Weekdays";
  if (sorted.length === 2 && sorted[0] === 6 && sorted[1] === 7)
    return "Weekends";
  return sorted.map((d) => DAY_LABELS[d - 1]).join(", ");
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${suffix}`;
}

interface RuleFormData {
  layout_id: number | null;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  enabled: boolean;
}

const EMPTY_FORM: RuleFormData = {
  layout_id: null,
  days_of_week: [1, 2, 3, 4, 5],
  start_time: "09:00",
  end_time: "17:00",
  enabled: true,
};

export default function Schedule() {
  const [rules, setRules] = useState<ScheduleRuleResponse[]>([]);
  const [layouts, setLayouts] = useState<LayoutListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schedulingEnabled, setSchedulingEnabled] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<RuleFormData>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(
    () =>
      Promise.all([api.getScheduleRules(), api.getLayouts(), api.getSettings()])
        .then(([rulesData, layoutsData, settings]) => {
          setError(null);
          setRules(rulesData);
          setLayouts(layoutsData);
          setSchedulingEnabled((settings as Settings).scheduling_enabled ?? false);
        })
        .catch(() => {
          setError("Failed to load schedule data.");
        })
        .finally(() => {
          setLoading(false);
        }),
    [],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleToggleEnabled() {
    setTogglingEnabled(true);
    setError(null);
    try {
      await api.updateSettings({
        scheduling_enabled: !schedulingEnabled,
      } as Settings);
      setSchedulingEnabled(!schedulingEnabled);
    } catch {
      setError("Failed to update scheduling setting.");
    } finally {
      setTogglingEnabled(false);
    }
  }

  function handleEdit(rule: ScheduleRuleResponse) {
    setEditingId(rule.id);
    setForm({
      layout_id: rule.layout_id,
      days_of_week: [...rule.days_of_week],
      start_time: rule.start_time,
      end_time: rule.end_time,
      enabled: rule.enabled,
    });
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  }

  async function handleSave() {
    if (form.days_of_week.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      if (editingId !== null) {
        await api.updateScheduleRule(editingId, {
          layout_id: form.layout_id,
          days_of_week: form.days_of_week,
          start_time: form.start_time,
          end_time: form.end_time,
          enabled: form.enabled,
        });
      } else {
        await api.createScheduleRule({
          layout_id: form.layout_id,
          days_of_week: form.days_of_week,
          start_time: form.start_time,
          end_time: form.end_time,
          enabled: form.enabled,
        } as ScheduleRuleCreate);
      }
      handleCancel();
      await fetchData();
    } catch {
      setError(
        editingId !== null
          ? "Failed to update rule."
          : "Failed to create rule."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(rule: ScheduleRuleResponse) {
    if (!confirm("Delete this schedule rule?")) return;
    setError(null);
    try {
      await api.deleteScheduleRule(rule.id);
      await fetchData();
    } catch {
      setError("Failed to delete rule.");
    }
  }

  async function handleToggleRule(rule: ScheduleRuleResponse) {
    setError(null);
    try {
      await api.updateScheduleRule(rule.id, { enabled: !rule.enabled });
      await fetchData();
    } catch {
      setError("Failed to toggle rule.");
    }
  }

  async function handleMoveUp(index: number) {
    if (index === 0) return;
    const newRules = [...rules];
    const items = newRules.map((r, i) => ({
      id: r.id,
      sort_order: i,
    }));
    // Swap with previous
    [items[index - 1], items[index]] = [items[index], items[index - 1]];
    items.forEach((item, i) => (item.sort_order = i));
    setError(null);
    try {
      const updated = await api.reorderScheduleRules(items);
      setRules(updated);
    } catch {
      setError("Failed to reorder rules.");
    }
  }

  async function handleMoveDown(index: number) {
    if (index === rules.length - 1) return;
    const newRules = [...rules];
    const items = newRules.map((r, i) => ({
      id: r.id,
      sort_order: i,
    }));
    // Swap with next
    [items[index], items[index + 1]] = [items[index + 1], items[index]];
    items.forEach((item, i) => (item.sort_order = i));
    setError(null);
    try {
      const updated = await api.reorderScheduleRules(items);
      setRules(updated);
    } catch {
      setError("Failed to reorder rules.");
    }
  }

  function toggleDay(day: number) {
    setForm((prev) => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter((d) => d !== day)
        : [...prev.days_of_week, day].sort(),
    }));
  }

  function setQuickDays(days: number[]) {
    setForm((prev) => ({ ...prev, days_of_week: days }));
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          <p className="mt-1 text-sm text-gray-600">
            Automatically switch layouts or turn off the display at specific
            times.
          </p>
        </div>
        <button
          onClick={handleToggleEnabled}
          disabled={togglingEnabled}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
            schedulingEnabled ? "bg-blue-600" : "bg-gray-200"
          }`}
        >
          <span className="sr-only">Enable scheduling</span>
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              schedulingEnabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 border border-red-200 p-4">
          <div className="flex">
            <svg
              className="h-5 w-5 text-red-500 flex-shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4a1 1 0 102 0V7zm-1 8a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <p className="ml-3 text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {schedulingEnabled && (
        <>
          {/* Add Rule button */}
          <div className="mt-6 flex justify-end">
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Add Rule
              </button>
            )}
          </div>

          {/* Add/Edit Form */}
          {showForm && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-white shadow-sm p-6">
              <h3 className="text-base font-semibold text-gray-900">
                {editingId !== null ? "Edit Rule" : "Add Rule"}
              </h3>

              <div className="mt-4 space-y-4">
                {/* Days of week */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Days
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {DAY_LABELS.map((label, i) => {
                      const day = i + 1;
                      const selected = form.days_of_week.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                            selected
                              ? "bg-blue-600 text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setQuickDays([1, 2, 3, 4, 5])}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Weekdays
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickDays([6, 7])}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Weekends
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickDays([1, 2, 3, 4, 5, 6, 7])}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Every day
                    </button>
                  </div>
                </div>

                {/* Time range */}
                <div className="flex gap-4">
                  <div>
                    <label
                      htmlFor="start-time"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Start time
                    </label>
                    <input
                      id="start-time"
                      type="time"
                      value={form.start_time}
                      onChange={(e) =>
                        setForm({ ...form, start_time: e.target.value })
                      }
                      className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="end-time"
                      className="block text-sm font-medium text-gray-700"
                    >
                      End time
                    </label>
                    <input
                      id="end-time"
                      type="time"
                      value={form.end_time}
                      onChange={(e) =>
                        setForm({ ...form, end_time: e.target.value })
                      }
                      className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Action */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Action
                  </label>
                  <div className="mt-2 space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="action"
                        checked={form.layout_id === null}
                        onChange={() =>
                          setForm({ ...form, layout_id: null })
                        }
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">
                        Display Off
                      </span>
                    </label>
                    {layouts.map((layout) => (
                      <label key={layout.id} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="action"
                          checked={form.layout_id === layout.id}
                          onChange={() =>
                            setForm({ ...form, layout_id: layout.id })
                          }
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">
                          Show: {layout.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={saving || form.days_of_week.length === 0}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving
                      ? "Saving..."
                      : editingId !== null
                        ? "Update"
                        : "Add"}
                  </button>
                  <button
                    onClick={handleCancel}
                    className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Rules list */}
          {rules.length > 0 ? (
            <div className="mt-4 space-y-3">
              {rules.map((rule, index) => {
                const layoutName =
                  rule.layout_id === null
                    ? "Display Off"
                    : layouts.find((l) => l.id === rule.layout_id)?.name ??
                      "Unknown layout";

                return (
                  <div
                    key={rule.id}
                    className={`rounded-lg border bg-white shadow-sm ${
                      rule.enabled
                        ? "border-gray-200"
                        : "border-gray-200 opacity-50"
                    }`}
                  >
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4 min-w-0">
                        {/* Reorder buttons */}
                        <div className="flex flex-col gap-0.5">
                          <button
                            onClick={() => handleMoveUp(index)}
                            disabled={index === 0}
                            className="rounded p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move up (higher priority)"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 15l7-7 7 7"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleMoveDown(index)}
                            disabled={index === rules.length - 1}
                            className="rounded p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move down (lower priority)"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          </button>
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900">
                              {formatDays(rule.days_of_week)}
                            </span>
                            <span className="text-sm text-gray-500">
                              {rule.start_time === rule.end_time
                                ? "All day"
                                : `${formatTime(rule.start_time)} - ${formatTime(rule.end_time)}`}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-0.5">
                            {rule.layout_id === null ? (
                              <span className="inline-flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-gray-900" />
                                Display Off
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-green-500" />
                                {layoutName}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                        {/* Enable/disable toggle */}
                        <button
                          onClick={() => handleToggleRule(rule)}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                            rule.enabled ? "bg-blue-600" : "bg-gray-200"
                          }`}
                          title={rule.enabled ? "Disable" : "Enable"}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              rule.enabled
                                ? "translate-x-4"
                                : "translate-x-0"
                            }`}
                          />
                        </button>
                        <button
                          onClick={() => handleEdit(rule)}
                          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(rule)}
                          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            !showForm && (
              <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
                <p className="text-sm text-gray-500">
                  No schedule rules configured. Add a rule to automatically
                  switch layouts or turn off the display at specific times.
                </p>
              </div>
            )
          )}

          <div className="mt-6 rounded-md bg-gray-50 border border-gray-200 p-4">
            <p className="text-sm text-gray-600">
              Rules are evaluated from top to bottom. The first matching rule
              wins. When no rule matches the current time, the
              manually-activated layout is shown.
            </p>
          </div>
        </>
      )}

      {!schedulingEnabled && (
        <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-semibold text-gray-900">
            Scheduling is disabled
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Enable scheduling to automatically switch layouts and control
            display power based on time of day.
          </p>
        </div>
      )}
    </div>
  );
}
