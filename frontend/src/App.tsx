import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import SidebarLayout from './components/SidebarLayout';
import RequestService from './components/RequestService';
import SystemStatusDashboard from './components/SystemStatusDashboard'; // placeholder for now
import DamagedBooksTable from './components/DamagedBooksTable';

const App = () => {
  return (
    <Router>
      <SidebarLayout>
        {/* Global header (shown across all pages) */}
        <div className="bg-white dark:bg-gray-900">
          <header className="flex items-center justify-between px-4 py-4 border-b dark:border-gray-800">
            <h1 className="text-xl md:text-2xl font-semibold">Admin Dashboard</h1>
          </header>
        </div>

        {/* Routed content */}
        <div className="pt-4">
          <Routes>
            <Route path="/requests" element={<RequestService />} />
            <Route path="/damaged" element={<DamagedBooksTable />} />
            <Route path="/status" element={<SystemStatusDashboard />} />
            <Route path="*" element={<Navigate to="/requests" replace />} />
          </Routes>
        </div>
      </SidebarLayout>
    </Router>
  );
};

export default App;