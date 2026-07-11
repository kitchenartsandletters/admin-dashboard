import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

const LOGO_URL =
  'https://rcrfakzdutwiuxsmsbkr.supabase.co/storage/v1/object/public/Images/KALInitialsOnly.png';

// The logo mark pairs with a typographic wordmark set in Garamond (KAL's
// logo typeface), with graceful fallbacks for machines without it.
const GARAMOND =
  'Garamond, "EB Garamond", "Adobe Garamond Pro", "Apple Garamond", "Times New Roman", Georgia, serif';

export default function LoginPage() {
  const { user, authReady } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sendingLink, setSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authReady && user) {
      navigate('/', { replace: true });
    }
  }, [user, authReady, navigate]);

  const handlePasswordLogin = async () => {
    if (submitting || !email || !password) return;

    setError(null);
    setSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }
    // Success: navigation handled by auth state change
  };

  const handleMagicLinkLogin = async () => {
    if (submitting || sendingLink || !email) return;

    setError(null);
    setSendingLink(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });

    setSendingLink(false);

    if (error) {
      setError(error.message);
      return;
    }
    setLinkSent(true);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-5 h-20 w-20 rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 dark:ring-gray-700 flex items-center justify-center p-3">
            <img
              src={LOGO_URL}
              alt="Kitchen Arts & Letters"
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <h1
            className="text-[26px] leading-tight text-gray-900 dark:text-white"
            style={{ fontFamily: GARAMOND }}
          >
            Kitchen Arts &amp; Letters
          </h1>
          <p className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
            Staff Dashboard
          </p>
        </div>

        {/* Credentials */}
        <div className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            autoComplete="username"
            className="w-full px-4 py-3 rounded-xl border bg-white dark:bg-gray-900 dark:text-white
                       dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none
                       placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-50"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
          />
          <input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            className="w-full px-4 py-3 rounded-xl border bg-white dark:bg-gray-900 dark:text-white
                       dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none
                       placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-50"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordLogin(); }}
            disabled={submitting}
          />
        </div>

        <button
          className="mt-4 w-full px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white
                     font-semibold disabled:opacity-50 transition-colors active:scale-[0.99]"
          onClick={handlePasswordLogin}
          disabled={submitting || !email || !password}
        >
          {submitting ? 'Signing you in…' : 'Sign in'}
        </button>

        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
        )}

        {linkSent && (
          <p className="mt-3 text-sm text-green-600 dark:text-green-400 text-center">
            Check your email for the sign-in link.
          </p>
        )}

        {/* Magic link — de-emphasized secondary path */}
        <div className="mt-6 text-center">
          <button
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:underline disabled:opacity-50"
            onClick={handleMagicLinkLogin}
            disabled={submitting || sendingLink || !email}
            title={!email ? 'Enter your email first' : 'Email me a one-time sign-in link'}
          >
            {sendingLink ? 'Sending link…' : 'Trouble signing in? Email me a magic link'}
          </button>
        </div>
      </div>
    </div>
  );
}
