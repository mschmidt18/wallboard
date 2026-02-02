import { BrowserRouter, Routes, Route } from "react-router-dom";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div>Dashboard (coming soon)</div>} />
        <Route path="/admin/*" element={<div>Admin (coming soon)</div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
