export type CampaignResponseRow = {
  id: number;
  email: string;
  product_title: string;
  order_id: string | null;
  response: "keep_order" | "cancel_order" | "unsigned_copy" | null;
  created_at: string;
};

export type CampaignStats = {
  total: number;
  keep_order: number;
  cancel_order: number;
  unsigned_copy: number;
};