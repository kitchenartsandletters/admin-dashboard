// File: frontend/src/pages/WelcomePage.tsx

import { useAuth } from '../auth/AuthProvider';

export default function WelcomePage() {
  const { role } = useAuth();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold mb-4">
        Welcome to the KAL Admin Dashboard
      </h1>

      <p className="text-gray-600 mb-6">
        Your access within the dashboard depends on your assigned role.
      </p>

      {role && (
        <p className="text-sm text-gray-500">
          You are logged in as: <span className="font-medium">{role}</span>
        </p>
      )}
    </div>
  );
}