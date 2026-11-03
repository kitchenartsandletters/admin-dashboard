// ScActorSync.tsx
// Forwards who is signed in to supplyChainApi's actor headers, so supply-chain
// writes are attributed in purchase_order_line_changes and po_entry_events.
// Renders nothing.
//
//   X-Actor-Email / X-Actor-Role       the Supabase session (useAuth)
//   X-Actor-Staff-Id / X-Actor-Staff-Name
//                                      the PIN-picked staff member on a shared
//                                      terminal (useStaff().activeStaff)
//
// CLIENT-ASSERTED, NOT AUTHENTICATED. The backend authenticates with one shared
// token and records these as asserted_actor_* / asserted_staff_*.
// See supply-chain-service/docs/PO_LINE_AUDIT.md §1.
//
// Shared terminals: on role 'user' sessions (e.g. letters@) the session email
// names the shared login; the staff headers name the person at the keyboard.
// Keep them apart. Never pack the staff name into X-Actor-Email or
// X-Actor-Role; those columns mean the Supabase session. Admin and editor
// sessions have no staff layer, so activeStaff is null and the staff headers
// are simply not sent.
//
// Mount inside AuthProvider and StaffProvider (useStaff throws outside it), and
// before <Router>, so this effect runs before any route's effects and the
// first supply-chain request already carries headers.

import { useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { useStaff } from './StaffProvider';
import { setScActor } from '../api/supplyChainApi';

export default function ScActorSync() {
  const { user, role } = useAuth();
  const { activeStaff } = useStaff();
  const email = user?.email ?? null;
  const staffId = activeStaff?.id ?? null;
  const staffName = activeStaff?.name ?? null;

  useEffect(() => {
    setScActor(email ? { email, role, staffId, staffName } : null);
  }, [email, role, staffId, staffName]);

  return null;
}
