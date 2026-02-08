import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./dashboard/Dashboard";
import AdminShell from "./admin/AdminShell";
import Layouts from "./admin/Layouts";
import LayoutEditor from "./admin/LayoutEditor";
import Integrations from "./admin/Integrations";
import Schedule from "./admin/Schedule";
import Settings from "./admin/Settings";
import About from "./admin/About";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<AdminIndex />} />
          <Route path="layouts" element={<Layouts />} />
          <Route path="layouts/:id" element={<LayoutEditor />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="settings" element={<Settings />} />
          <Route path="about" element={<About />} />
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

export default App;
