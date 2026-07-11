// StaffPicker.tsx
// Full-screen "Who's working?" screen for shared terminal accounts.
// Shown by StaffGate when role === 'user' and no staff member is active.
//
// Flow: tap your name → enter your Shopify PIN → session runs under your
// name until 4h of inactivity (re-pick) or the nightly 11:59pm ET logout.
// PINs are verified server-side (verify_staff_pin RPC); hashes never reach
// the browser.

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';
import { useStaff } from './StaffProvider';

interface StaffRow {
  id: string;
  display_name: string;
  sort_order: number;
}

export default function StaffPicker() {
  const { logout } = useAuth();
  const { selectStaff } = useStaff();

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<StaffRow | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      const { data, error } = await supabase
        .from('staff_members')
        .select('id, display_name, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('display_name', { ascending: true });
      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
      } else {
        setStaff((data ?? []) as StaffRow[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Focus the PIN field when a name is chosen
  useEffect(() => {
    if (selected) {
      setPin('');
      setPinError(null);
      setTimeout(() => pinInputRef.current?.focus(), 50);
    }
  }, [selected]);

  const handleVerify = async () => {
    if (!selected || !pin.trim() || verifying) return;
    setVerifying(true);
    setPinError(null);
    try {
      const { data, error } = await supabase.rpc('verify_staff_pin', {
        p_staff_id: selected.id,
        p_pin: pin.trim(),
      });
      if (error) {
        setPinError(error.message);
      } else if (data === true) {
        selectStaff(selected.id, selected.display_name);
        return; // gate unmounts this screen
      } else {
        // brief pause discourages rapid guessing
        await new Promise(r => setTimeout(r, 800));
        setPinError('Incorrect PIN — try again.');
        setPin('');
        pinInputRef.current?.focus();
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
            Kitchen Arts &amp; Letters
          </p>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
            {selected ? `Hi, ${selected.display_name}` : "Who's working?"}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {selected
              ? 'Enter your PIN to start your session.'
              : 'Choose your name to continue.'}
          </p>
        </div>

        {loading && (
          <div className="flex justify-center py-10">
            <div className="w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {loadError && (
          <div className="px-4 py-3 rounded-md bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 text-center">
            Couldn&apos;t load the staff list: {loadError}
          </div>
        )}

        {!loading && !loadError && !selected && (
          <div className="grid grid-cols-2 gap-3">
            {staff.map(s => (
              <button
                key={s.id}
                onClick={() => setSelected(s)}
                className="px-4 py-5 rounded-xl border border-gray-200 dark:border-gray-700
                           bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white
                           text-base font-semibold hover:border-blue-400 hover:bg-blue-50
                           dark:hover:bg-blue-900/20 transition-colors active:scale-[0.98]"
              >
                {s.display_name}
              </button>
            ))}
            {staff.length === 0 && (
              <p className="col-span-2 text-center text-sm text-gray-400 py-8">
                No active staff profiles. An administrator can add them in the dashboard database.
              </p>
            )}
          </div>
        )}

        {!loading && !loadError && selected && (
          <div className="space-y-4">
            <input
              ref={pinInputRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => { if (e.key === 'Enter') handleVerify(); }}
              placeholder="PIN"
              disabled={verifying}
              className="w-full px-4 py-3 text-center text-2xl tracking-[0.5em] font-mono
                         border rounded-xl bg-white dark:bg-gray-900 dark:text-white
                         dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none
                         disabled:opacity-50"
            />

            {pinError && (
              <p className="text-sm text-red-600 dark:text-red-400 text-center">{pinError}</p>
            )}

            <button
              onClick={handleVerify}
              disabled={!pin.trim() || verifying}
              className="w-full px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white
                         font-semibold disabled:opacity-50 transition-colors active:scale-[0.99]"
            >
              {verifying ? 'Checking…' : 'Start session'}
            </button>

            <button
              onClick={() => setSelected(null)}
              disabled={verifying}
              className="w-full text-sm text-gray-500 dark:text-gray-400 hover:underline"
            >
              ← Not you? Choose someone else
            </button>
          </div>
        )}

        <div className="mt-10 text-center">
          <button
            onClick={() => logout()}
            className="text-xs text-gray-400 dark:text-gray-500 hover:underline"
          >
            Log out of this device
          </button>
        </div>
      </div>
    </div>
  );
}
