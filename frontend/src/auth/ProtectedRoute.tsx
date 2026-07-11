import React, { JSX } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, Role } from './AuthProvider';
import MissingProfile from '../pages/MissingProfile';
import AuthLoading from '../components/AuthLoading';

interface ProtectedRouteProps {
  children: JSX.Element;
  requiredRoles?: Role[];
}

export default function ProtectedRoute({
  children,
  requiredRoles,
}: ProtectedRouteProps) {
  const { user, role, authReady, profileLoading } = useAuth();

  // 1. Still resolving auth, or resolving a freshly signed-in user's profile.
  //    Gating on profileLoading prevents a brief MissingProfile flash between
  //    "user known" and "role resolved" right after login.
  if (!authReady || profileLoading) {
    return <AuthLoading />;
  }

  // 2. Not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 3. Authenticated but not provisioned
  if (!role) {
    return <MissingProfile />;
  }

  // 4. Role mismatch
  if (requiredRoles && !requiredRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  // 5. Authorized
  return children;
}