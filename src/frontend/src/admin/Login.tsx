import { useState, type FormEvent } from "react";
import { api } from "../shared/api";

interface LoginProps {
  mode: "setup" | "login";
  onLogin: () => void;
}

export default function Login({ mode, onLogin }: LoginProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isSetup = mode === "setup";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isSetup) {
        await api.setup(password);
      }
      await api.login(password);
      onLogin();
    } catch {
      setError(
        isSetup
          ? "Failed to create password. Please try again."
          : "Invalid password. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
          Wallboard
        </h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          {isSetup
            ? "Create a password to get started"
            : "Sign in to the admin panel"}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {isSetup ? "Choose a password" : "Password"}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder={isSetup ? "Choose a password" : "Enter your password"}
              required
              autoFocus
            />
          </div>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading
              ? isSetup
                ? "Setting up..."
                : "Signing in..."
              : isSetup
                ? "Create password"
                : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
