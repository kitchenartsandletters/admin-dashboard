const BASE = import.meta.env.VITE_API_BASE_URL;

export async function fetchCampaignResponses({
  limit = 100,
}: {
  limit?: number;
}) {
  try {
    console.log("FETCHING RESPONSES...");

    const url = `${BASE}/api/campaign-responses?limit=${limit}&token=${import.meta.env.VITE_ADMIN_TOKEN}`;
    console.log("RESPONSES URL:", url);

    const res = await fetch(url);

    if (!res.ok) throw new Error("Failed to fetch responses");

    const data = await res.json();
    console.log("RESPONSES DATA:", data);

    return data;
  } catch (err) {
    console.error("FETCH RESPONSES ERROR:", err);
    throw err;
  }
}

export async function fetchCampaignStats() {
  const res = await fetch(`${BASE}/api/campaign-stats?campaign=noma-signed-copy-decision&token=${import.meta.env.VITE_ADMIN_TOKEN}`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}