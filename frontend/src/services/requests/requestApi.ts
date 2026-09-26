// services/requests/requestApi.ts
//
// The ONLY way the dashboard talks to request-service (api.kitchenartsandletters.com).
// Mirrors the other modules: one base URL, one module-owned token, sent as X-Admin-Token.
//
//   VITE_REQUEST_BASE_URL      e.g. https://api.kitchenartsandletters.com
//   VITE_REQUEST_ADMIN_TOKEN   request-service's admin token (its VITE_ADMIN_TOKEN on Railway)
//
// Replaces VITE_API_BASE_URL / VITE_BLACKLIST_URL / VITE_REQUEST_URL for request routes,
// and the ?token= query param (tokens in URLs end up in logs and browser history).
// See request-service/docs/DOCS_STATUS.md for the dependency map.

const BASE = (import.meta.env.VITE_REQUEST_BASE_URL as string | undefined)?.replace(/\/+$/, '');
const TOKEN = import.meta.env.VITE_REQUEST_ADMIN_TOKEN as string | undefined;

if (!BASE || !TOKEN) {
  console.error(
    '[requestApi] VITE_REQUEST_BASE_URL and/or VITE_REQUEST_ADMIN_TOKEN is not set. ' +
      'Request, notes and blacklist screens will fail until both are configured.'
  );
}

/** fetch() against request-service with the admin token attached. `path` starts with /api/... */
export function requestFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('X-Admin-Token', TOKEN ?? '');
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${BASE ?? ''}${path}`, { ...init, headers });
}

/** POST a JSON body. */
export function requestPost(path: string, body?: unknown): Promise<Response> {
  return requestFetch(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Run a Shopify Admin GraphQL query through request-service's admin-gated proxy. */
export async function shopifyGraphQL<T = any>(query: string): Promise<T> {
  const res = await requestPost('/api/shopify/graphql', { query });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.errors) {
    throw new Error(
      `Shopify lookup failed (HTTP ${res.status})` +
        (json?.errors ? `: ${JSON.stringify(json.errors).slice(0, 200)}` : '')
    );
  }
  return json as T;
}
