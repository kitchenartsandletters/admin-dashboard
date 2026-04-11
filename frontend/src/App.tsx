import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import SidebarLayout from './components/SidebarLayout';
import RequestService from './components/RequestService';
import SystemStatusDashboard from './components/SystemStatusDashboard';
import DamagedBooksTable from './components/DamagedBooksTable';
import BlacklistManager from './components/BlackListManager';
import DamagedBooksWizard from './components/DamagedBooksWizard';
import { AuthProvider } from './auth/AuthProvider';
import ProtectedRoute from './auth/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import WelcomePage from './pages/WelcomePage';
import AccountPage from './pages/AccountPage';
import ReportsPage from './reports/ReportsPage';
import PreorderService from './services/preorder/PreorderService';
import CampaignDashboard from './services/campaigns/CampaignService';
import BusinessCalendarPage from './components/BusinessCalendarPage';
import { supabase } from './lib/supabase';
import DefaultRedirect from './auth/DefaultRedirect';
import { useState, useEffect } from 'react';

const App = () => {
  // 1. Logic for the ticking clock
  const [dateTime, setDateTime] = useState({ date: "", time: "" });

  useEffect(() => {
    // Formatter for: Monday, December 29, 2025
    const dateOptions: Intl.DateTimeFormatOptions = {
      timeZone: 'America/New_York',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };

    // Formatter for: 5:03:29 PM (hour: 'numeric' removes the leading zero)
    const timeOptions: Intl.DateTimeFormatOptions = {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    };

    const dateFormatter = new Intl.DateTimeFormat('en-US', dateOptions);
    const timeFormatter = new Intl.DateTimeFormat('en-US', timeOptions);

    const updateDateTime = () => {
      const now = new Date();
      setDateTime({
        date: dateFormatter.format(now),
        time: timeFormatter.format(now),
      });
    };

    updateDateTime();
    const timer = setInterval(updateDateTime, 1000);
    return () => clearInterval(timer);
  }, []);

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
                <SidebarLayout dateTime={dateTime}>
                  {/* Global header (shown across all pages) */}
                  {/* ADDED: hidden md:block to hide this large header on mobile */}
                  <div className="bg-white dark:bg-gray-900 hidden md:block">
                    <header className="flex items-center justify-between px-4 py-4 border-b dark:border-gray-800">
                      {/* Two-line Header */}
                      <div className="flex flex-col">
                        <span className="text-xs md:text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          {dateTime.date || "Loading..."}
                        </span>
                        <span className="text-xl md:text-2xl font-bold font-mono tabular-nums text-gray-900 dark:text-white">
                          {dateTime.time}
                        </span>
                      </div>
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
                          <ProtectedRoute requiredRoles={['admin', 'editor', 'user']}>
                            <DamagedBooksTable />
                          </ProtectedRoute>
                        }
                      />

                      <Route
                        path="/damaged/bulk-create"
                        element={
                          <ProtectedRoute requiredRoles={['admin']}>
                            <DamagedBooksWizard />
                          </ProtectedRoute>
                        }
                      />

                      <Route
                        path="/reports"
                        element={
                          <ProtectedRoute requiredRoles={['admin']}>
                            <ReportsPage />
                          </ProtectedRoute>
                        }
                      />

                      <Route
                        path="/reports/calendar"
                        element={
                          <ProtectedRoute requiredRoles={['admin']}>
                            <BusinessCalendarPage />
                          </ProtectedRoute>
                        }
                      />

                      <Route
                        path="/reports/jobs/:jobId"
                        element={
                          <ProtectedRoute requiredRoles={['admin']}>
                            <ReportJobPage />
                          </ProtectedRoute>
                        }
                      />

                      <Route
                        path="/preorders"
                        element={
                          <ProtectedRoute requiredRoles={['admin', 'editor']}>
                            <PreorderService />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/campaigns"
                        element={
                          <ProtectedRoute requiredRoles={['admin', 'editor']}>
                            <CampaignDashboard />
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