import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

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
    if (submitting) return;

    setError(null);
    setSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }

    // Success: navigation handled by auth state change
  };

  const handleMagicLinkLogin = async () => {
    if (submitting) return;

    setError(null);
    setSubmitting(true);
    setSendingLink(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });

    setSendingLink(false);
    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }

    setLinkSent(true);
  };

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-80 space-y-4">
        <h1 className="text-xl font-semibold">Admin Dashboard</h1>

        <div className="space-y-2">
          <input
            type="email"
            placeholder="Email"
            className="w-full border p-2 rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full border p-2 rounded"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />
        </div>

        <button
          className="w-full bg-black text-white p-2 rounded disabled:opacity-50"
          onClick={handlePasswordLogin}
          disabled={submitting || !email || !password}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="text-center text-sm text-gray-500">or</div>

        <button
          className="w-full border p-2 rounded disabled:opacity-50"
          onClick={handleMagicLinkLogin}
          disabled={submitting || sendingLink || !email}
        >
          {sendingLink ? 'Sending link…' : 'Send magic link'}
        </button>

        {linkSent && (
          <p className="text-sm text-green-600">
            Check your email for the sign-in link.
          </p>
        )}

        {error && (
          <p className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}