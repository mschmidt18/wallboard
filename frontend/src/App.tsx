import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./dashboard/Dashboard";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/admin/*" element={<div>Admin (coming soon)</div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
