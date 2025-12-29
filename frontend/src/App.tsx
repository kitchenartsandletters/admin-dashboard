import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import SidebarLayout from './components/SidebarLayout';
import RequestService from './components/RequestService';
import SystemStatusDashboard from './components/SystemStatusDashboard'; // placeholder for now
import DamagedBooksTable from './components/DamagedBooksTable';
import BlacklistManager from './components/BlackListManager';
import { AuthProvider } from './auth/AuthProvider';
import ProtectedRoute from './auth/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import WelcomePage from './pages/WelcomePage';
import AccountPage from './pages/AccountPage';
import { supabase } from './lib/supabase';
import DefaultRedirect from './auth/DefaultRedirect';

const App = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public login route */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected application */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <SidebarLayout>
                  {/* Global header (shown across all pages) */}
                  <div className="bg-white dark:bg-gray-900">
                    <header className="flex items-center justify-between px-4 py-4 border-b dark:border-gray-800">
                      <h1 className="text-xl md:text-2xl font-semibold">Admin Dashboard</h1>
                      <button
                        onClick={() => supabase.auth.signOut()}
                        className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                      >
                        Log out
                      </button>
                    </header>
                  </div>

                  {/* Routed content */}
                  <div className="pt-4">
                    <Routes>
                      <Route
                        path="/requests"
                        element={
                          <ProtectedRoute requiredRoles={['admin', 'editor']}>
                            <RequestService />
                          </ProtectedRoute>
                        }
                      />

                      <Route
                        path="/blacklist"
                        element={
                          <ProtectedRoute requiredRoles={['admin', 'editor']}>
                            <BlacklistManager />
                          </ProtectedRoute>
                        }
                      />

                      <Route
                        path="/damaged"
                        element={
                          <ProtectedRoute requiredRoles={['admin', 'editor']}>
                            <DamagedBooksTable />
                          </ProtectedRoute>
                        }
                      />

                      <Route
                        path="/status"
                        element={
                          <ProtectedRoute requiredRoles={['admin']}>
                            <SystemStatusDashboard />
                          </ProtectedRoute>
                        }
                      />

                      <Route
                        path="/welcome"
                        element={
                          <ProtectedRoute>
                            <WelcomePage />
                          </ProtectedRoute>
                        }
                      />

                      <Route
                        path="/account"
                        element={
                          <ProtectedRoute requiredRoles={['admin', 'editor', 'user']}>
                            <AccountPage />
                          </ProtectedRoute>
                        }
                      />

                      <Route path="*" element={<DefaultRedirect />} />
                    </Routes>
                  </div>
                </SidebarLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default App;