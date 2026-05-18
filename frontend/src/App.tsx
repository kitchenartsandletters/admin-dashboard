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
import ReportJobPage from './components/ReportJobPage';
import SupplierService from './supply-chain/suppliers/SupplierService'
import POService from './supply-chain/purchase-orders/POService'
import ReceivingWizard from './supply-chain/receiving/ReceivingWizard'
import TransferService from './supply-chain/transfers/TransferService'
import { supabase } from './lib/supabase';
import DefaultRedirect from './auth/DefaultRedirect';
import { useState, useEffect } from 'react';
import ReportExclusionsPage from './reports/exclusions/ReportExclusionsPage';
import ReleaseManagement from './components/preorder/ReleaseManagement';
import ShippingProfiles from './components/preorder/ShippingProfiles';
import OrderTaggingPage from './components/preorder/OrderTaggingPage';
import EdelweissLookup from './components/tools/EdelweissLookup';
import NytReportPage from './components/reports/NytReportPage';

const App = () => {
  const [dateTime, setDateTime] = useState({ date: "", time: "" });

  useEffect(() => {
    const dateOptions: Intl.DateTimeFormatOptions = {
      timeZone: 'America/New_York',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
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
      setDateTime({ date: dateFormatter.format(now), time: timeFormatter.format(now) });
    };
    updateDateTime();
    const timer = setInterval(updateDateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <SidebarLayout dateTime={dateTime}>
                  <div className="bg-white dark:bg-gray-900 hidden md:block">
                    <header className="flex items-center justify-between px-4 py-4 border-b dark:border-gray-800">
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

                  <div className="pt-4">
                    <Routes>
                      <Route path="/requests" element={
                        <ProtectedRoute requiredRoles={['admin', 'editor']}>
                          <RequestService />
                        </ProtectedRoute>
                      } />
                      <Route path="/blacklist" element={
                        <ProtectedRoute requiredRoles={['admin', 'editor']}>
                          <BlacklistManager />
                        </ProtectedRoute>
                      } />
                      <Route path="/damaged" element={
                        <ProtectedRoute requiredRoles={['admin', 'editor', 'user']}>
                          <DamagedBooksTable />
                        </ProtectedRoute>
                      } />
                      <Route path="/damaged/bulk-create" element={
                        <ProtectedRoute requiredRoles={['admin']}>
                          <DamagedBooksWizard />
                        </ProtectedRoute>
                      } />
                      <Route path="/reports" element={
                        <ProtectedRoute requiredRoles={['admin', 'editor']}>
                          <ReportsPage />
                        </ProtectedRoute>
                      } />
                      <Route path="/reports/calendar" element={
                        <ProtectedRoute requiredRoles={['admin', 'editor']}>
                          <BusinessCalendarPage />
                        </ProtectedRoute>
                      } />
                      <Route path="/reports/jobs/:jobId" element={
                        <ProtectedRoute requiredRoles={['admin', 'editor']}>
                          <ReportJobPage />
                        </ProtectedRoute>
                      } />
                      <Route path="/reports/exclusions" element={
                        <ProtectedRoute requiredRoles={['admin', 'editor']}>
                          <ReportExclusionsPage />
                        </ProtectedRoute>
                      } />
                      <Route path="/reports/nyt" element={
                        <ProtectedRoute requiredRoles={['admin', 'editor']}>
                          <NytReportPage />
                        </ProtectedRoute>
                      } />
                      <Route path="/preorders" element={
                        <ProtectedRoute requiredRoles={['admin', 'editor']}>
                          <PreorderService />
                        </ProtectedRoute>
                      } />
                      <Route path="/preorders/release" element={
                        <ProtectedRoute requiredRoles={['admin', 'editor']}>
                          <ReleaseManagement />
                        </ProtectedRoute>
                      } />
                      <Route path="/preorders/shipping" element={
                        <ProtectedRoute requiredRoles={['admin', 'editor']}>
                          <ShippingProfiles />
                        </ProtectedRoute>
                      } />
                      <Route path="/preorders/tagging" element={
                        <ProtectedRoute requiredRoles={['admin', 'editor']}>
                          <OrderTaggingPage />
                        </ProtectedRoute>
                      } />
                      <Route path="/campaigns" element={
                        <ProtectedRoute requiredRoles={['admin']}>
                          <CampaignDashboard />
                        </ProtectedRoute>
                      } />
                      <Route path="/suppliers" element={
                        <ProtectedRoute requiredRoles={['admin']}>
                          <SupplierService />
                        </ProtectedRoute>
                      } />
                      <Route path="/purchase-orders" element={
                        <ProtectedRoute requiredRoles={['admin']}>
                          <POService />
                        </ProtectedRoute>
                      } />
                      <Route path="/receiving" element={
                        <ProtectedRoute requiredRoles={['admin']}>
                          <ReceivingWizard />
                        </ProtectedRoute>
                      } />
                      <Route path="/transfers" element={
                        <ProtectedRoute requiredRoles={['admin']}>
                          <TransferService />
                        </ProtectedRoute>
                      } />

                      {/* ── Tools ── */}
                      <Route path="/tools/edelweiss-lookup" element={
                        <ProtectedRoute requiredRoles={['admin', 'editor']}>
                          <EdelweissLookup />
                        </ProtectedRoute>
                      } />

                      <Route path="/status" element={
                        <ProtectedRoute requiredRoles={['admin']}>
                          <SystemStatusDashboard />
                        </ProtectedRoute>
                      } />
                      <Route path="/welcome" element={
                        <ProtectedRoute>
                          <WelcomePage />
                        </ProtectedRoute>
                      } />
                      <Route path="/account" element={
                        <ProtectedRoute requiredRoles={['admin', 'editor', 'user']}>
                          <AccountPage />
                        </ProtectedRoute>
                      } />
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