// StaffProvider.tsx
// App-level staff identity for shared terminal accounts (role === 'user').
//
// Layer 1 (security) is the Supabase session — e.g. letters@, the shared
// terminal login. Layer 2 (identity) is this: which staff member is at the
// keyboard. Staff are rows in public.staff_members, NOT auth users. After
// login, StaffGate shows the picker until a staff member is chosen (name +
// PIN, verified server-side via the verify_staff_pin RPC).
//
// Rules:
//   - Selection persists in localStorage so refreshes don't re-prompt.
//   - Selection expires after 4 hours of inactivity → picker reappears
//     (the Supabase session itself stays alive; see useDailyLogout for the
//     nightly 11:59pm ET hard logout).
//   - Signing out of Supabase clears the staff selection too.
//
// Admin/editor accounts (gil@, op@, matt@) never see the picker.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';
import StaffPicker from './StaffPicker';

const STORAGE_KEY = 'kal_active_staff';
const ACTIVITY_KEY = 'kal_staff_last_activity';
const INACTIVITY_LIMIT_MS = 4 * 60 * 60 * 1000; // 4 hours
const ACTIVITY_WRITE_THROTTLE_MS = 60 * 1000;   // persist activity at most 1/min

export interface ActiveStaff {
  id: string;
  name: string;
  selectedAt: string; // ISO
}

interface StaffContextValue {
  activeStaff: ActiveStaff | null;
  selectStaff: (id: string, name: string) => void;
  clearStaff: () => void;
}

const StaffContext = createContext<StaffContextValue | undefined>(undefined);

function readStoredStaff(): ActiveStaff | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveStaff;
    if (!parsed?.id || !parsed?.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readLastActivity(): number {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function isExpiredByInactivity(): boolean {
  const last = readLastActivity();
  if (!last) return false; // no activity recorded yet — treat selection time as fresh
  return Date.now() - last > INACTIVITY_LIMIT_MS;
}

export function StaffProvider({ children }: { children: ReactNode }) {
  const [activeStaff, setActiveStaff] = useState<ActiveStaff | null>(() => {
    const stored = readStoredStaff();
    if (stored && isExpiredByInactivity()) {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      return null;
    }
    return stored;
  });
  const lastActivityWriteRef = useRef(0);

  const clearStaff = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(ACTIVITY_KEY);
    } catch { /* ignore */ }
    setActiveStaff(null);
  }, []);

  const selectStaff = useCallback((id: string, name: string) => {
    const staff: ActiveStaff = { id, name, selectedAt: new Date().toISOString() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(staff));
      localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
    } catch { /* ignore */ }
    lastActivityWriteRef.current = Date.now();
    setActiveStaff(staff);
  }, []);

  // Clear staff selection whenever the Supabase session ends
  // (manual log out, or the 11:59pm cutoff in useDailyLogout).
  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') clearStaff();
    });
    return () => subscription.subscription.unsubscribe();
  }, [clearStaff]);

  // Track activity (throttled) while a staff member is active.
  useEffect(() => {
    if (!activeStaff) return;

    const recordActivity = () => {
      const now = Date.now();
      if (now - lastActivityWriteRef.current < ACTIVITY_WRITE_THROTTLE_MS) return;
      lastActivityWriteRef.current = now;
      try { localStorage.setItem(ACTIVITY_KEY, String(now)); } catch { /* ignore */ }
    };

    const checkInactivity = () => {
      if (isExpiredByInactivity()) clearStaff();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkInactivity();
    };

    window.addEventListener('pointerdown', recordActivity);
    window.addEventListener('keydown', recordActivity);
    document.addEventListener('visibilitychange', onVisibility);
    const interval = setInterval(checkInactivity, 60 * 1000);

    return () => {
      window.removeEventListener('pointerdown', recordActivity);
      window.removeEventListener('keydown', recordActivity);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, [activeStaff, clearStaff]);

  const value = useMemo(
    () => ({ activeStaff, selectStaff, clearStaff }),
    [activeStaff, selectStaff, clearStaff]
  );

  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export function useStaff(): StaffContextValue {
  const ctx = useContext(StaffContext);
  if (!ctx) throw new Error('useStaff must be used within a StaffProvider');
  return ctx;
}

/**
 * Gate: shared-terminal accounts (role === 'user') must pick a staff profile
 * before seeing the app. Admin/editor accounts pass straight through.
 * Render inside ProtectedRoute so auth + provisioning are already resolved.
 */
export function StaffGate({ children }: { children: ReactNode }) {
  const { user, role, authReady } = useAuth();
  const { activeStaff } = useStaff();

  if (!authReady || !user) return <>{children}</>; // handled upstream
  if (role === 'user' && !activeStaff) return <StaffPicker />;
  return <>{children}</>;
}

/**
 * Small header chip showing who's active, with a switch action.
 * Renders nothing for admin/editor sessions (no staff layer).
 */
export function StaffChip() {
  const { activeStaff, clearStaff } = useStaff();
  if (!activeStaff) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 border dark:border-gray-700">
      <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{activeStaff.name}</span>
      <button
        onClick={clearStaff}
        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        title="Switch to a different staff member"
      >
        Switch
      </button>
    </div>
  );
}
