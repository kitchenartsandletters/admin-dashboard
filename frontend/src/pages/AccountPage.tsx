import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import DarkModeToggle from '../components/DarkModeToggle';

function formatRole(role: string | null | undefined) {
  if (!role) return '—';
  switch (role) {
    case 'admin':
      return 'Administrator';
    case 'editor':
      return 'Editor';
    case 'user':
      return 'User';
    default:
      return role;
  }
}

export default function AccountPage() {
  const { user, role } = useAuth();
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<
    { type: 'success' | 'error'; message: string } | null
  >(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    setIsDarkMode(document.documentElement.classList.contains('dark'));
  }, []);

  const handleToggleDarkMode = () => {
    setIsDarkMode((prev) => {
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

  const handlePasswordUpdate = async () => {
    if (!newPassword || newPassword !== confirmPassword) {
      return;
    }

    setPasswordLoading(true);
    setPasswordStatus(null);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      setPasswordStatus({
        type: 'error',
        message: error.message,
      });
    } else {
      setPasswordStatus({
        type: 'success',
        message: 'Password updated successfully.',
      });
      setNewPassword('');
      setConfirmPassword('');
    }

    setPasswordLoading(false);
  };

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-sm text-gray-500">
          Manage your account information and preferences.
        </p>
      </header>

      <section className="border rounded-md p-4 space-y-2">
        <h2 className="text-lg font-medium mb-2">Identity</h2>

        <p className="text-sm text-gray-600">
          <span className="font-medium">Email:</span>{' '}
          {user?.email ?? '—'}
        </p>

        <p className="text-sm text-gray-600">
          <span className="font-medium">Role:</span>{' '}
          {formatRole(role)}
        </p>

        <p className="text-sm text-gray-600">
          <span className="font-medium">Account status:</span>{' '}
          Active
        </p>

        <p className="text-xs text-gray-500 pt-2">
          Roles and access are managed by administrators. If you believe your access is incorrect,
          please contact an administrator.
        </p>
      </section>

      <section className="border rounded-md p-4 space-y-3">
        <h2 className="text-lg font-medium mb-2">Preferences</h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Appearance
            </p>
            <p className="text-xs text-gray-500">
              Toggle between light and dark mode.
            </p>
          </div>
          <DarkModeToggle
            isDarkMode={isDarkMode}
            setIsDarkMode={handleToggleDarkMode}
          />
        </div>
      </section>
      <section className="border rounded-md p-4 space-y-4">
        <h2 className="text-lg font-medium">Security</h2>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
            New password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
            Confirm new password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        {passwordStatus && (
          <p
            className={`text-sm ${
              passwordStatus.type === 'success'
                ? 'text-green-600'
                : 'text-red-600'
            }`}
          >
            {passwordStatus.message}
          </p>
        )}

        <button
          onClick={handlePasswordUpdate}
          disabled={
            passwordLoading ||
            !newPassword ||
            newPassword !== confirmPassword
          }
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {passwordLoading ? 'Updating…' : 'Update password'}
        </button>
      </section>
    </div>
  );
}