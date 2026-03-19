export type CampaignResponseRow = {
  id: number;
  email: string;
  product_title: string;
  order_id: string;
  order_name: string | null;
  response: "keep_order" | "cancel_order" | "unsigned_copy" | null;
  recorded_at: string;
  created_at: string;
};

export type CampaignStats = {
  totals: {
    recipients: number;
    sent: number;
    remaining: number;
  };
  delivery: {
    sent: number;
    failed: number;
  };
  responses: {
    total: number;
    rate: number;
  };
  breakdown: {
    keep_order: number;
    unsigned_copy: number;
    cancel_order: number;
    no_response: number;
  };
  meta?: {
    generated_at?: number;
    campaign?: string;
  };
};