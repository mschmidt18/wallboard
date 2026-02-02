import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./dashboard/Dashboard";
import AdminShell from "./admin/AdminShell";
import Integrations from "./admin/Integrations";
import Settings from "./admin/Settings";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<AdminIndex />} />
          <Route path="layouts" element={<PlaceholderPage title="Layouts" />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function AdminIndex() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Welcome</h1>
      <p className="mt-2 text-gray-600">
        Select a section from the sidebar to get started.
      </p>
    </div>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <p className="mt-2 text-gray-600">This page is coming soon.</p>
    </div>
  );
}

export default App;
