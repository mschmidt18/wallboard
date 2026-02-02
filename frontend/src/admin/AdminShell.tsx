import { useEffect, useState } from "react";
import { api } from "../shared/api";
import AdminLayout from "./AdminLayout";
import Login from "./Login";

type AuthState = "loading" | "authenticated" | "unauthenticated";

export default function AdminShell() {
  const [authState, setAuthState] = useState<AuthState>("loading");

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
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

  if (authState === "unauthenticated") {
    return <Login onLogin={() => setAuthState("authenticated")} />;
  }

  return <AdminLayout onLogout={() => setAuthState("unauthenticated")} />;
}
