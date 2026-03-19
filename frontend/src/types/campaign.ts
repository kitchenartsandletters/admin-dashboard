export type CampaignResponseRow = {
  id: number;
  email: string;
  product_title: string;
  order_id: string | null;
  response: "keep_order" | "cancel_order" | "unsigned_copy" | null;
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
    yes: number;
    no: number;
    maybe: number;
    no_response: number;
  };
  meta?: {
    generated_at?: number;
    campaign?: string;
  };
};