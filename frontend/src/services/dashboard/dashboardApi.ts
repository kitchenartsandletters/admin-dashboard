// services/dashboard/dashboardApi.ts
//
// Where the dashboard reaches its OWN backend (admin-dashboard/backend: reports,
// calendar/schedule overrides, exclusions, /api/health). Mirrors
// services/requests/requestApi.ts, which covers request-service.
//
//   VITE_DASHBOARD_BASE_URL     e.g. https://dashboard-api.kitchenartsandletters.com
//   VITE_DASHBOARD_ADMIN_TOKEN  this backend's admin token (its VITE_ADMIN_TOKEN on Railway)
//
// Replaces VITE_API_BASE_URL, VITE_ADMIN_BACKEND (same host, two names) and the
// generic VITE_ADMIN_TOKEN.

// Always strings ('' when unset) so callers and child props stay simply typed;
// the console error below flags a missing value at startup.
export const DASHBOARD_BASE_URL: string =
  ((import.meta.env.VITE_DASHBOARD_BASE_URL as string | undefined) ?? '').replace(/\/+$/, '');
export const DASHBOARD_ADMIN_TOKEN: string = (import.meta.env.VITE_DASHBOARD_ADMIN_TOKEN as string | undefined) ?? '';

if (!DASHBOARD_BASE_URL || !DASHBOARD_ADMIN_TOKEN) {
  console.error(
    '[dashboardApi] VITE_DASHBOARD_BASE_URL and/or VITE_DASHBOARD_ADMIN_TOKEN is not set. ' +
      'Reports, calendar and exclusions will fail until both are configured.'
  );
}
