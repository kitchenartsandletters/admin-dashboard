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

  // --- load data ---
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);

        const [responsesRes, statsRes] = await Promise.all([
          fetchCampaignResponses({ limit: 500 }),
          fetchCampaignStats(),
        ]);

        setRows(responsesRes.rows);
        const normalizedStats = {
          totals: {
            recipients: statsRes.total,
            sent: statsRes.total,
            remaining: 0,
          },
          delivery: {
            sent: statsRes.total,
            failed: 0,
          },
          responses: {
            total:
              statsRes.keep_order +
              statsRes.cancel_order +
              statsRes.unsigned_copy,
            rate:
              statsRes.total > 0
                ? (
                    (statsRes.keep_order +
                      statsRes.cancel_order +
                      statsRes.unsigned_copy) /
                    statsRes.total
                  )
                : 0,
          },
          breakdown: {
            yes: statsRes.keep_order,
            no: statsRes.cancel_order,
            maybe: statsRes.unsigned_copy,
            no_response:
              statsRes.total -
              (statsRes.keep_order +
                statsRes.cancel_order +
                statsRes.unsigned_copy),
          },
          meta: {
            generated_at: Math.floor(Date.now() / 1000),
            campaign: "ngtbf",
          },
        };

        setStats(normalizedStats);
      } catch (err) {
        console.error("Campaign load failed:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // --- filtering ---
  const filteredData = useMemo(() => {
    const val = searchFilter.toLowerCase();

    return rows.filter((row) => {
      const matchesSearch =
        (row.email?.toLowerCase() || "").includes(val) ||
        (row.product_title?.toLowerCase() || "").includes(val) ||
        (row.order_id?.toLowerCase() || "").includes(val);

      const matchesResponse =
        responseFilter === "all" ||
        row.response === responseFilter;

      return matchesSearch && matchesResponse;
    });
  }, [rows, searchFilter, responseFilter]);

  if (loading && viewMode === "dashboard") {
    return <div className="p-6">Loading campaign metrics...</div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-white min-h-screen">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">
              Campaign Console
            </h1>
            <p className="text-sm text-gray-500">
              Monitor responses and outcomes
            </p>
          </div>

          <CampaignTabs
            activeTab={viewMode}
            onChange={setViewMode}
          />
        </div>
      </div>

      {/* Dashboard */}
      {viewMode === "dashboard" && stats && (
        <CampaignDashboard data={stats} />
      )}

      {/* Responses View */}
      {viewMode === "responses" && (
        <div>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Search email, product, order..."
              value={searchFilter}
              onChange={(e) =>
                setSearchFilter(e.target.value)
              }
              className="w-full sm:w-1/2 px-3 py-2 border rounded-md text-sm"
            />

            <select
              value={responseFilter}
              onChange={(e) =>
                setResponseFilter(
                  e.target.value as ResponseFilter
                )
              }
              className="px-3 py-2 border rounded-md text-sm"
            >
              <option value="all">All</option>
              <option value="keep_order">Confirm</option>
              <option value="unsigned_copy">Unsigned</option>
              <option value="cancel_order">Cancel</option>
            </select>
          </div>

          {/* Loading */}
          {loading && (
            <div className="text-sm text-gray-500">
              Loading...
            </div>
          )}

          {/* Table */}
          {!loading && (
            <CampaignTable rows={filteredData} />
          )}
        </div>
      )}
    </div>
  );
}