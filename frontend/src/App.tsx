import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import SidebarLayout from './components/SidebarLayout';
import RequestService from './components/RequestService';
import SystemStatusDashboard from './components/SystemStatusDashboard'; // placeholder for now
import DamagedBooksTable from './components/DamagedBooksTable';

const App = () => {
  return (
    <Router>
      <SidebarLayout>
        <Routes>
          <Route path="/requests" element={<RequestService />} />
          <Route path="/damaged" element={<DamagedBooksTable />} />
          <Route path="/status" element={<SystemStatusDashboard />} />
          <Route path="*" element={<Navigate to="/requests" replace />} />
        </Routes>
      </SidebarLayout>
    </Router>
  );
};

export default App;