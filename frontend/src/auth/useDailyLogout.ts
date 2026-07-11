// useDailyLogout.ts
// Hard end-of-day logout: every Supabase session on this device expires at
// the next 11:59 PM America/New_York after sign-in, every day incl. weekends.
//
// How it works: at sign-in we store the cutoff instant in localStorage. On
// app boot, tab focus, visibility change, and a 1-minute interval we compare
// now vs cutoff and call supabase.auth.signOut() once passed. Signing out
// also clears the active staff selection (StaffProvider listens for
// SIGNED_OUT). Someone signing in at e.g. 11:59:30 PM gets until the
// following night's cutoff.
//
// This is client-side enforcement — appropriate for a shared in-store
// terminal (the threat is "left logged in overnight", not adversarial
// bypass). DST is handled by computing the cutoff from NY wall-clock parts.

import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

const CUTOFF_KEY = 'kal_session_cutoff';
const NY_TZ = 'America/New_York';
const CUTOFF_HOUR = 23;
const CUTOFF_MINUTE = 59;

interface WallParts { y: number; m: number; d: number; h: number; min: number; s: number }

function nyWallParts(date: Date): WallParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: NY_TZ,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  return { y: +map.year, m: +map.month, d: +map.day, h: +map.hour, min: +map.minute, s: +map.second };
}

/** UTC instant for a given NY wall-clock time (iterative correction handles DST). */
function nyTimeToUtc(y: number, m: number, d: number, h: number, min: number): Date {
  let ts = Date.UTC(y, m - 1, d, h, min, 0);
  for (let i = 0; i < 3; i++) {
    const p = nyWallParts(new Date(ts));
    const wall = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
    const desired = Date.UTC(y, m - 1, d, h, min, 0);
    const diff = desired - wall;
    if (diff === 0) break;
    ts += diff;
  }
  return new Date(ts);
}

/** The next 11:59 PM NY strictly after `now`. Exported for testability. */
export function nextCutoff(now: Date): Date {
  const p = nyWallParts(now);
  let candidate = nyTimeToUtc(p.y, p.m, p.d, CUTOFF_HOUR, CUTOFF_MINUTE);
  if (candidate.getTime() <= now.getTime()) {
    // Advance one NY calendar day via pure date arithmetic (Date.UTC
    // normalizes month/year overflow), then recompute the instant.
    const next = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
    candidate = nyTimeToUtc(
      next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(),
      CUTOFF_HOUR, CUTOFF_MINUTE
    );
  }
  return candidate;
}

function readCutoff(): number | null {
  try {
    const raw = localStorage.getItem(CUTOFF_KEY);
    if (!raw) return null;
    const n = Date.parse(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeCutoffIfMissing() {
  try {
    if (!localStorage.getItem(CUTOFF_KEY)) {
      localStorage.setItem(CUTOFF_KEY, nextCutoff(new Date()).toISOString());
    }
  } catch { /* ignore */ }
}

function clearCutoff() {
  try { localStorage.removeItem(CUTOFF_KEY); } catch { /* ignore */ }
}

export function useDailyLogout() {
  useEffect(() => {
    let signingOut = false;

    const check = async () => {
      const cutoff = readCutoff();
      if (cutoff === null || Date.now() < cutoff || signingOut) return;
      signingOut = true;
      clearCutoff();
      try {
        await supabase.auth.signOut(); // StaffProvider clears staff on SIGNED_OUT
      } finally {
        signingOut = false;
      }
    };

    // Establish a cutoff for any existing session (covers app boot after
    // the tab was closed) and for fresh sign-ins; drop it on sign-out.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        writeCutoffIfMissing();
        check();
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        clearCutoff();
      } else if (session) {
        writeCutoffIfMissing();
      }
    });

    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };

    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisibility);
    const interval = setInterval(check, 60 * 1000);

    return () => {
      subscription.subscription.unsubscribe();
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, []);
}
