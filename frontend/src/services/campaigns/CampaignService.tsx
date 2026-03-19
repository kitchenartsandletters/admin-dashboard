import { useEffect, useState, useMemo } from "react";
import CampaignTable from "./CampaignTable";
import CampaignDashboard from "./CampaignDashboard";
import CampaignTabs from "./CampaignTabs";

import {
  fetchCampaignResponses,
  fetchCampaignStats,
} from "./campaign.api";

import {
  CampaignResponseRow,
  CampaignStats,
} from "../../types/campaign";

type ViewMode = "dashboard" | "responses";

type ResponseFilter =
  | "all"
  | "keep_order"
  | "unsigned_copy"
  | "cancel_order";

export default function CampaignService() {
  const [rows, setRows] = useState<CampaignResponseRow[]>([]);
  const [stats, setStats] = useState<CampaignStats | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [searchFilter, setSearchFilter] = useState("");
  const [responseFilter, setResponseFilter] =
    useState<ResponseFilter>("all");

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [responsesRes, statsRes] = await Promise.all([
          fetchCampaignResponses({ limit: 500 }),
          fetchCampaignStats(),
        ]);

        setRows(Array.isArray(responsesRes) ? responsesRes : responsesRes.rows || []);
        setStats(statsRes);
      } catch (err) {
        console.error("Failed to load campaign data", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredData = useMemo(() => {
    return rows.filter((r) => {
      const matchesSearch =
        !searchFilter ||
        r.email.toLowerCase().includes(searchFilter.toLowerCase()) ||
        r.order_name?.toLowerCase().includes(searchFilter.toLowerCase());

      const matchesResponse =
        responseFilter === "all" || r.response === responseFilter;

      return matchesSearch && matchesResponse;
    });
  }, [rows, searchFilter, responseFilter]);

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-white dark:bg-gray-950 min-h-screen">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            Campaign Metrics
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            NGTBF Response Tracking
          </p>
        </div>
        <CampaignTabs activeTab={viewMode} onChange={setViewMode} />
      </div>

      {/* Dashboard View */}
      {viewMode === "dashboard" && stats && (
        <CampaignDashboard data={stats} />
      )}

      {/* Responses View */}
      {viewMode === "responses" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Search email or order..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="flex-1 px-3 py-2 border rounded-md text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500/20 outline-none"
            />

            <select
              value={responseFilter}
              onChange={(e) => setResponseFilter(e.target.value as ResponseFilter)}
              className="px-3 py-2 border rounded-md text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500/20 outline-none"
            >
              <option value="all">All Responses</option>
              <option value="keep_order">Keep Order</option>
              <option value="unsigned_copy">Unsigned Copy</option>
              <option value="cancel_order">Cancel Order</option>
            </select>
          </div>

          {loading ? (
            <div className="py-12 text-center text-gray-500 animate-pulse">Loading responses...</div>
          ) : (
            <CampaignTable rows={filteredData} />
          )}
        </div>
      )}
    </div>
  );
}