import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
  useRef,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type Role = 'admin' | 'editor' | 'user';

interface AuthContextValue {
  user: User | null;
  role: Role | null;
  authReady: boolean;
  /** True while a signed-in user's profile/role is still being resolved. */
  profileLoading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const hasHydratedOnceRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);

  /**
   * Hydrate auth + profile state from a Supabase user.
   * Missing profile is treated as a valid but blocked state.
   */
  const hydrateFromUser = async (supabaseUser: User | null) => {
    // Only show global loading on the very first hydration
    if (!hasHydratedOnceRef.current) {
      setAuthReady(false);
    }

    if (!supabaseUser) {
      currentUserIdRef.current = null;
      setUser(null);
      setRole(null);
      setProfileLoading(false);
      setAuthReady(true);
      hasHydratedOnceRef.current = true;
      return;
    }

    // A different user id than we last resolved means we don't yet know this
    // user's role. Gate on profileLoading so ProtectedRoute shows the loading
    // screen (not MissingProfile) until the fetch below resolves. Token
    // refreshes for the same user keep their known role and re-fetch silently.
    const isNewUser = currentUserIdRef.current !== supabaseUser.id;
    currentUserIdRef.current = supabaseUser.id;

    setUser(supabaseUser);
    if (isNewUser) setProfileLoading(true);

    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', supabaseUser.id)
      .single();

    if (error || !data) {
      setRole(null);
    } else {
      setRole(data.role as Role);
    }

    setProfileLoading(false);
    setAuthReady(true);
    hasHydratedOnceRef.current = true;
  };

  useEffect(() => {
    // Initial session load
    supabase.auth.getSession().then(({ data }) => {
      hydrateFromUser(data.session?.user ?? null);
    });

    // Subscribe to auth changes
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        hydrateFromUser(session?.user ?? null);
      }
    );

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    // Navigation is handled elsewhere (ProtectedRoute / App)
  }, []);

  const authContextValue = useMemo(
    () => ({
      user,
      role,
      authReady,
      profileLoading,
      logout,
    }),
    [user, role, authReady, profileLoading, logout]
  );

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}