export type EndpointStatus = {
  url: string;
  status: 'Healthy' | 'Degraded' | 'Offline';
  code?: number;
  message?: string;
};

export type ServiceStatus = {
  name: string;
  endpoints: EndpointStatus[];
  lastChecked: string;
};

export async function fetchSystemStatuses(): Promise<ServiceStatus[]> {
  const now = new Date().toLocaleString();
  const headers = {
    'Content-Type': 'application/json',
    'X-Admin-Token': import.meta.env.VITE_DBS_ADMIN_TOKEN
  };

  async function check(url: string, opts: RequestInit = {}): Promise<EndpointStatus> {
    try {
      const res = await fetch(url, opts);
      const status = res.ok ? 'Healthy' : 'Degraded';
      return { url, status, code: res.status, message: res.statusText };
    } catch (err: any) {
      return { url, status: 'Offline', message: err.message };
    }
  }

  return [
    {
      name: 'Admin Dashboard Frontend',
      lastChecked: now,
      endpoints: await Promise.all([
        check(import.meta.env.VITE_ADMIN_DASHBOARD_FE),
        check(import.meta.env.VITE_ADMIN_DASHBOARD_FE_RAILWAY),
      ]),
    },
    {
      name: 'Admin Dashboard Backend',
      lastChecked: now,
      endpoints: await Promise.all([
        check(`${import.meta.env.VITE_ADMIN_BACKEND}/api/interest?token=${import.meta.env.VITE_ADMIN_TOKEN}`),
      ]),
    },
    {
      name: 'Request Service',
      lastChecked: now,
      endpoints: await Promise.all([
        check(`${import.meta.env.VITE_REQ_PUBLIC}/api/interest?token=${import.meta.env.VITE_ADMIN_TOKEN}`),
        check(`${import.meta.env.VITE_REQ_RAILWAY}/api/interest?token=${import.meta.env.VITE_ADMIN_TOKEN}`),
      ]),
    },
    {
      name: 'Damaged Books Service',
      lastChecked: now,
      endpoints: await Promise.all([
        check(`${import.meta.env.VITE_DBS_URL}/admin/reconcile/status`, { headers }),
        check(import.meta.env.VITE_DBS_CRON),
      ]),
    },
    {
      name: 'Webhook Gateway',
      lastChecked: now,
      endpoints: await Promise.all([
        check(import.meta.env.VITE_WEBHOOK_URL),
        check(import.meta.env.VITE_WEBHOOK_CRON),
      ]),
    },
  ];
}
