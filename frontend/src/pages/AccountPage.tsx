// AccountPage.tsx — complete updated version with density toggle
// Changes from current:
//   - Density state and handler added alongside dark mode
//   - Preferences section now shows both Appearance and Display Density
//   - Density preference persists to localStorage and applies to <html> class

import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import DarkModeToggle from '../components/DarkModeToggle';

function formatRole(role: string | null | undefined) {
  if (!role) return '—';
  switch (role) {
    case 'admin':   return 'Administrator';
    case 'editor':  return 'Editor';
    case 'user':    return 'User';
    default:        return role;
  }
}

export default function AccountPage() {
  const { user, role } = useAuth();

  // Dark mode
  const [isDarkMode, setIsDarkMode] = useState(false);
  useEffect(() => {
    setIsDarkMode(document.documentElement.classList.contains('dark'));
  }, []);
  const handleToggleDarkMode = () => {
    setIsDarkMode(prev => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
      return next;
    });
  };

  // Display density
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  useEffect(() => {
    const saved = localStorage.getItem('density') as 'comfortable' | 'compact' | null;
    if (saved === 'compact' || saved === 'comfortable') setDensity(saved);
  }, []);
  const handleDensityChange = (next: 'comfortable' | 'compact') => {
    document.documentElement.classList.remove('density-comfortable', 'density-compact');
    document.documentElement.classList.add(`density-${next}`);
    localStorage.setItem('density', next);
    setDensity(next);
  };

  // Password
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const handlePasswordUpdate = async () => {
    if (!newPassword || newPassword !== confirmPassword) return;
    setPasswordLoading(true);
    setPasswordStatus(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordStatus({ type: 'error', message: error.message });
    } else {
      setPasswordStatus({ type: 'success', message: 'Password updated successfully.' });
      setNewPassword('');
      setConfirmPassword('');
    }
    setPasswordLoading(false);
  };

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-sm text-gray-500">Manage your account information and preferences.</p>
      </header>

      {/* Identity */}
      <section className="border rounded-md p-4 space-y-2">
        <h2 className="text-lg font-medium mb-2">Identity</h2>
        <p className="text-sm text-gray-600"><span className="font-medium">Email:</span> {user?.email ?? '—'}</p>
        <p className="text-sm text-gray-600"><span className="font-medium">Role:</span> {formatRole(role)}</p>
        <p className="text-sm text-gray-600"><span className="font-medium">Account status:</span> Active</p>
        <p className="text-xs text-gray-500 pt-2">
          Roles and access are managed by administrators. If you believe your access is incorrect,
          please contact an administrator.
        </p>
      </section>

      {/* Preferences */}
      <section className="border rounded-md p-4 space-y-5">
        <h2 className="text-lg font-medium">Preferences</h2>

        {/* Appearance — dark mode */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Appearance</p>
            <p className="text-xs text-gray-500">Toggle between light and dark mode.</p>
          </div>
          <DarkModeToggle isDarkMode={isDarkMode} setIsDarkMode={handleToggleDarkMode} />
        </div>

        {/* Display density */}
        <div>
          <div className="mb-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Display density</p>
            <p className="text-xs text-gray-500">
              Comfortable uses larger text and spacing. Compact fits more information on screen.
            </p>
          </div>
          <div className="flex gap-3">
            {(['comfortable', 'compact'] as const).map(d => (
              <button
                key={d}
                type="button"
                onClick={() => handleDensityChange(d)}
                className={`flex-1 px-4 py-3 rounded-lg border-2 text-left transition-colors
                  ${density === d
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
              >
                <p className={`text-sm font-semibold capitalize
                  ${density === d ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                  {d}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {d === 'comfortable'
                    ? 'Larger text, more spacing. Better for new users and accessibility.'
                    : 'Smaller text, denser layout. Better for experienced users managing many items.'}
                </p>
                {/* Preview */}
                <div className={`mt-2 px-2 py-1.5 rounded bg-gray-100 dark:bg-gray-800
                  ${d === 'comfortable' ? 'text-sm' : 'text-xs'}`}>
                  <span className="text-gray-700 dark:text-gray-300">Sample text</span>
                  <span className={`ml-2 font-mono text-gray-400
                    ${d === 'comfortable' ? 'text-xs' : 'text-[10px]'}`}>
                    9780593796573
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="border rounded-md p-4 space-y-4">
        <h2 className="text-lg font-medium">Security</h2>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">New password</label>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-600" />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Confirm new password</label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-600" />
        </div>
        {passwordStatus && (
          <p className={`text-sm ${passwordStatus.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {passwordStatus.message}
          </p>
        )}
        <button onClick={handlePasswordUpdate}
          disabled={passwordLoading || !newPassword || newPassword !== confirmPassword}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
          {passwordLoading ? 'Updating…' : 'Update password'}
        </button>
      </section>
    </div>
  );
}
