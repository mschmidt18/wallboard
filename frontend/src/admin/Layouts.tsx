import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../shared/api";
import type { Layout } from "../shared/types";

export default function Layouts() {
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchLayouts();
  }, []);

  async function fetchLayouts() {
    try {
      setError(null);
      const data = await api.getLayouts();
      setLayouts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load layouts");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.createLayout({ name: newName.trim() });
      setNewName("");
      setShowCreate(false);
      await fetchLayouts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create layout");
    } finally {
      setCreating(false);
    }
  }

  async function handleActivate(id: number) {
    try {
      setError(null);
      await api.activateLayout(id);
      await fetchLayouts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to activate layout");
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!window.confirm(`Delete layout "${name}"? This cannot be undone.`)) {
      return;
    }
    try {
      setError(null);
      await api.deleteLayout(id);
      await fetchLayouts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete layout");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-500 text-sm">Loading layouts...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Layouts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your dashboard layouts
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
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
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          New Layout
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 rounded-md bg-red-50 border border-red-200 p-4">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-red-400 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Inline create form */}
      {showCreate && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <form onSubmit={handleCreate} className="flex items-end gap-3">
            <div className="flex-1">
              <label
                htmlFor="layout-name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Layout name
              </label>
              <input
                id="layout-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Living Room"
                autoFocus
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setNewName("");
              }}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Layout list */}
      {layouts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <svg
            className="mx-auto h-12 w-12 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm10 0a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z"
            />
          </svg>
          <h3 className="mt-3 text-sm font-semibold text-gray-900">
            No layouts yet
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Create a layout to get started with your dashboard.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {layouts.map((layout) => (
            <div
              key={layout.id}
              className="relative rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Active badge */}
              {layout.is_active && (
                <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  Active
                </span>
              )}

              {/* Layout info */}
              <Link
                to={`/admin/layouts/${layout.id}`}
                className="block group"
              >
                <h3 className="text-base font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors pr-16">
                  {layout.name}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {layout.columns} columns &middot;{" "}
                  {(layout as any).widget_count ?? layout.widgets?.length ?? 0}{" "}
                  widget
                  {((layout as any).widget_count ?? layout.widgets?.length ?? 0) !== 1
                    ? "s"
                    : ""}
                </p>
              </Link>

              {/* Actions */}
              <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3">
                <Link
                  to={`/admin/layouts/${layout.id}`}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Edit
                </Link>
                {!layout.is_active && (
                  <button
                    onClick={() => handleActivate(layout.id)}
                    className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
                  >
                    Activate
                  </button>
                )}
                <button
                  onClick={() => handleDelete(layout.id, layout.name)}
                  className="ml-auto rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
