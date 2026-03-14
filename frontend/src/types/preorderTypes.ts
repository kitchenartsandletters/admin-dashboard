// src/types/preorderTypes.ts
// ⚠️ MVP / Beta scaffold
// Purpose: shared frontend types for preorder-service admin dashboard integration
// Source of truth for business logic remains backend persistence.
// The UI should display these values, not derive them independently.

export type PreorderClassificationStatus =
  | 'active_preorder'
  | 'early_stock_arrival'
  | 'historical_preorder'
  | 'not_a_preorder_product'
  | `anomaly_${string}`;

export type ArrivalTiming =
  | 'no_arrival'
  | 'early_arrival'
  | 'on_time_arrival'
  | 'late_arrival';

export type LifecycleState =
  // Keep this intentionally flexible because backend naming is transitional.
  | 'unknown'
  | 'presale_open'
  | 'released'
  | 'closed'
  | 'backordered'
  | string;

export type ReportingState =
  | 'not_queued'
  | 'queued'
  | 'reported'
  | 'unknown';

export type EffectivePubDateSource =
  | 'override_date'
  | 'custom_pub_date'
  | 'legacy_tag'
  | 'unresolved'
  | 'unknown';

export interface PreorderRow {
  // Core identity
  product_id: number;
  title: string;
  isbn: string | null;
  vendor?: string | null;
  handle?: string | null;

  // Canonical preorder classification
  classification_status: PreorderClassificationStatus;
  anomaly_type: string | null;

  // Publication date
  effective_pub_date: string | null; // ISO date: YYYY-MM-DD
  effective_pub_date_source?: EffectivePubDateSource | null;

  // Inventory / arrival
  arrival_timing: ArrivalTiming;
  first_positive_inventory_at: string | null; // ISO datetime
  first_positive_inventory_qty?: number | null;

  // Lifecycle
  lifecycle_state: LifecycleState;
  lifecycle_snapshot_at?: string | null; // ISO datetime
  lifecycle_closed_at?: string | null; // ISO datetime
  presale_commitment_total?: number | null;

  // Reporting / release workflow
  reporting_state?: ReportingState | null;
  released_to_reporting: boolean;
  release_report_week_start: string | null; // ISO date
  release_report_week_end?: string | null; // ISO date
  released_at?: string | null; // ISO datetime
  csv_filename?: string | null;

  // Safe admin actions / metadata
  can_reclassify?: boolean;
  last_reclassified_at?: string | null; // ISO datetime

  // Display/meta helpers
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ReleaseReviewRow {
  product_id: number;
  title: string;
  isbn: string | null;

  target_report_week_start: string; // ISO date
  target_report_week_end?: string | null; // ISO date

  presales_banked: number;
  weekly_sales: number;
  reporting_quantity: number;

  already_reported: boolean;
  released_at?: string | null;
  csv_filename?: string | null;

  classification_status?: PreorderClassificationStatus;
  anomaly_type?: string | null;
}

export interface PreorderSummaryMetrics {
  active_preorders: number;
  early_stock_arrivals: number;
  anomalies: number;
  eligible_for_reporting_this_week: number;
  already_reported_this_week: number;
}

export interface PreorderFilters {
  search: string;
  classification_status: PreorderClassificationStatus | 'all';
  arrival_timing: ArrivalTiming | 'all';
  anomaly_mode: 'all' | 'anomaly_only' | 'non_anomaly_only';
  reporting_state: ReportingState | 'all';
  release_week_start: string | 'all';
}

export interface PreorderListResponse {
  data: PreorderRow[];
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export interface ReleaseReviewListResponse {
  data: ReleaseReviewRow[];
  meta?: {
    total?: number;
    target_report_week_start?: string;
  };
}

export interface ReclassifyProductResponse {
  success: boolean;
  product_id: number;
  message?: string;
}