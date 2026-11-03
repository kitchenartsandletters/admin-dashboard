// ScActorSync.tsx
// Forwards the signed-in session to supplyChainApi's actor headers
// (X-Actor-Email / X-Actor-Role), so supply-chain writes are attributed in
// purchase_order_line_changes. Renders nothing.
//
// CLIENT-ASSERTED, NOT AUTHENTICATED. The backend authenticates with one shared
// token and records these as asserted_actor_email / asserted_actor_role.
// See supply-chain-service/docs/PO_LINE_AUDIT.md §1.
//
// Known gap: shared terminal accounts. On role 'user' sessions (e.g. letters@)
// the session email names the shared login, not the staff member at the
// keyboard — that person is useStaff().activeStaff. The backend has no header
// for staff identity yet, so terminal writes are attributed to the account
// only. Do not pack the staff name into X-Actor-Email or X-Actor-Role to work
// around this; those columns mean the Supabase session.
//
// Mount inside AuthProvider and before <Router>, so this effect runs before any
// route's effects and the first supply-chain request already carries headers.

import { useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { setScActor } from '../api/supplyChainApi';

export default function ScActorSync() {
  const { user, role } = useAuth();
  const email = user?.email ?? null;

  useEffect(() => {
    setScActor(email ? { email, role } : null);
  }, [email, role]);

  return null;
}
