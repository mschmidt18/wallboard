import { useEffect, useState } from "react";
import { api } from "../shared/api";
import AdminLayout from "./AdminLayout";
import Login from "./Login";

type AuthState = "loading" | "authenticated" | "unauthenticated" | "setup";

export default function AdminShell() {
  const [authState, setAuthState] = useState<AuthState>("loading");

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const { setup_required } = await api.getAuthStatus();
      if (setup_required) {
        setAuthState("setup");
        return;
      }
      await api.getSettings();
      setAuthState("authenticated");
    } catch {
      setAuthState("unauthenticated");
    }
  }

  if (authState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-500 text-sm">Loading...</div>
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
