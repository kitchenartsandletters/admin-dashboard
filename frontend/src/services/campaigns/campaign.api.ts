const BASE = import.meta.env.VITE_API_BASE_URL;

export async function fetchCampaignResponses({
  limit = 100,
}: {
  limit?: number;
}) {
  const res = await fetch(`${BASE}/api/campaign-responses?limit=${limit}&token=${import.meta.env.VITE_ADMIN_TOKEN}`);
  if (!res.ok) throw new Error("Failed to fetch responses");
  return res.json();
}

export async function fetchCampaignStats() {
  const res = await fetch(`${BASE}/api/campaign-stats?campaign=ngtbf&token=${import.meta.env.VITE_ADMIN_TOKEN}`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}