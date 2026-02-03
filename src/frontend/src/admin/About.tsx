import { useEffect, useState } from "react";
import { api } from "../shared/api";
import type {
  VersionResponse,
  UpdateCheckResponse,
  UpdateResponse,
} from "../shared/types";

export default function About() {
  const [version, setVersion] = useState<VersionResponse | null>(null);
  const [versionLoading, setVersionLoading] = useState(true);
  const [versionError, setVersionError] = useState<string | null>(null);

  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResponse | null>(
    null,
  );
  const [checking, setChecking] = useState(false);

  const [updateResult, setUpdateResult] = useState<UpdateResponse | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadVersion();
  }, []);

  async function loadVersion() {
    setVersionLoading(true);
    setVersionError(null);
    try {
      const data = await api.getVersion();
      setVersion(data);
    } catch {
      setVersionError("Failed to load version information.");
    } finally {
      setVersionLoading(false);
    }
  }

  async function handleCheckUpdate() {
    setChecking(true);
    setUpdateCheck(null);
    setUpdateResult(null);
    try {
      const data = await api.checkUpdate();
      setUpdateCheck(data);
    } catch {
      setUpdateCheck({
        up_to_date: null,
        commits_behind: null,
        commits: [],
        error: "Failed to check for updates.",
      });
    } finally {
      setChecking(false);
    }
  }

  async function handleUpdate() {
    setUpdating(true);
    setUpdateResult(null);
    try {
      const data = await api.runUpdate();
      setUpdateResult(data);
      if (data.status === "ok") {
        await loadVersion();
        setUpdateCheck(null);
      }
    } catch {
      setUpdateResult({
        status: "error",
        steps_completed: [],
        step_failed: "request",
        fallback_instructions:
          "SSH into the server and run: cd /opt/wallboard && git pull && sudo systemctl restart wallboard-server",
      });
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">About</h1>
      <p className="mt-1 text-sm text-gray-500">
        Version information and system updates.
      </p>

      {/* Version Section */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
          Version
        </h2>
        {versionLoading ? (
          <div className="mt-4 text-sm text-gray-500">
            Loading version info...
          </div>
        ) : versionError ? (
          <div className="mt-4 text-sm text-red-600">{versionError}</div>
        ) : version ? (
          <dl className="mt-4 space-y-3">
            <div className="flex items-baseline gap-3">
              <dt className="text-sm font-medium text-gray-500 w-24 flex-shrink-0">
                Commit
              </dt>
              <dd className="text-sm font-mono text-gray-900">
                {version.commit_short ?? "unknown"}
              </dd>
            </div>
            <div className="flex items-baseline gap-3">
              <dt className="text-sm font-medium text-gray-500 w-24 flex-shrink-0">
                Date
              </dt>
              <dd className="text-sm text-gray-900">
                {version.commit_date ?? "unknown"}
              </dd>
            </div>
            <div className="flex items-baseline gap-3">
              <dt className="text-sm font-medium text-gray-500 w-24 flex-shrink-0">
                Branch
              </dt>
              <dd className="text-sm text-gray-900">
                {version.branch ?? "unknown"}
              </dd>
            </div>
          </dl>
        ) : null}
      </section>

      {/* Check for Updates Section */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
          Updates
        </h2>
        <div className="mt-4">
          <button
            onClick={handleCheckUpdate}
            disabled={checking}
            className="py-2 px-6 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {checking ? "Checking..." : "Check for updates"}
          </button>
        </div>

        {updateCheck && (
          <div className="mt-4">
            {updateCheck.error ? (
              <p className="text-sm text-red-600">{updateCheck.error}</p>
            ) : updateCheck.up_to_date ? (
              <p className="text-sm font-medium text-green-600">
                Up to date
              </p>
            ) : (
              <div>
                <p className="text-sm font-medium text-amber-600">
                  {updateCheck.commits_behind} commit
                  {updateCheck.commits_behind !== 1 ? "s" : ""} behind
                </p>
                {updateCheck.commits.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {updateCheck.commits.map((commit, i) => (
                      <li
                        key={i}
                        className="text-sm font-mono text-gray-700 pl-3 border-l-2 border-gray-200"
                      >
                        {commit}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Update Button */}
                <div className="mt-4">
                  <button
                    onClick={handleUpdate}
                    disabled={updating}
                    className="py-2 px-6 bg-amber-600 text-white font-medium rounded-md hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {updating ? "Updating..." : "Update now"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Update Result */}
        {updateResult && (
          <div className="mt-4">
            {updateResult.status === "ok" ? (
              <div>
                <p className="text-sm font-medium text-green-600">
                  Update completed successfully
                </p>
                {updateResult.steps_completed.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {updateResult.steps_completed.map((step, i) => (
                      <li key={i} className="text-sm text-gray-600">
                        <span className="text-green-500 mr-1">&#10003;</span>
                        {step}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-red-600">
                  Update failed
                  {updateResult.step_failed
                    ? ` at step: ${updateResult.step_failed}`
                    : ""}
                </p>
                {updateResult.steps_completed.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {updateResult.steps_completed.map((step, i) => (
                      <li key={i} className="text-sm text-gray-600">
                        <span className="text-green-500 mr-1">&#10003;</span>
                        {step}
                      </li>
                    ))}
                  </ul>
                )}
                {updateResult.fallback_instructions && (
                  <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-md">
                    <p className="text-sm font-medium text-gray-700 mb-1">
                      Manual update instructions:
                    </p>
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono">
                      {updateResult.fallback_instructions}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
