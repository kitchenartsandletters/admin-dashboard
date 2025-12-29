// File: frontend/src/auth/DefaultRedirect.tsx
import { useAuth } from './AuthProvider';
import { Navigate } from 'react-router-dom';
import AuthLoading from '../components/AuthLoading';

export default function DefaultRedirect() {
  const { role, authReady } = useAuth();

  // Still resolving auth / role
  if (!authReady) {
    return <AuthLoading />;
  }

  // Phase 1B.2 landing rules (locked)
  if (role === 'admin' || role === 'editor' || role === 'user') {
    return <Navigate to="/welcome" replace />;
  }

  // Fallback — should not normally occur
  return <Navigate to="/login" replace />;
}
