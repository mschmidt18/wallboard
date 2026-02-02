import { useEffect, useState } from "react";
import { api } from "../shared/api";
import AdminLayout from "./AdminLayout";
import Login from "./Login";

type AuthState = "loading" | "authenticated" | "unauthenticated" | "setup" | "error";

export default function AdminShell() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const { setup_required } = await api.getAuthStatus();
        if (cancelled) return;
        if (setup_required) {
          setAuthState("setup");
          return;
        }
        await api.getSettings();
        if (cancelled) return;
        setAuthState("authenticated");
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("401")) {
          setAuthState("unauthenticated");
        } else {
          setErrorMessage(message);
          setAuthState("error");
        }
      }
    }

    run();
    return () => { cancelled = true; };
  }, []);

  async function checkAuth() {
    setAuthState("loading");
    try {
      const { setup_required } = await api.getAuthStatus();
      if (setup_required) {
        setAuthState("setup");
        return;
      }
      await api.getSettings();
      setAuthState("authenticated");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("401")) {
        setAuthState("unauthenticated");
      } else {
        setErrorMessage(message);
        setAuthState("error");
      }
    }
  }

  if (authState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (authState === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <p className="text-red-600 text-sm mb-4">Unable to connect to the server.</p>
          <p className="text-gray-500 text-xs mb-4">{errorMessage}</p>
          <button
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            onClick={checkAuth}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (authState === "setup") {
    return (
      <Login mode="setup" onLogin={() => setAuthState("authenticated")} />
    );
  }

  if (authState === "unauthenticated") {
    return (
      <Login mode="login" onLogin={() => setAuthState("authenticated")} />
    );
  }

  return <AdminLayout onLogout={() => setAuthState("unauthenticated")} />;
}
