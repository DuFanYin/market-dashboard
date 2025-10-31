export type CnnIndexRow = {
  name: string;
  current: number;
  prev: number;
  change: number;
  pct: number;
};

export type CnnIndexes = {
  success: boolean;
  data?: CnnIndexRow[];
  reason?: string;
};

export type FearGreedDetail = { score: number | null; rating: string | null; value: number | null } | null;

export type CnnFearGreed = {
  success: boolean;
  summary?: {
    score: number | null;
    rating: string | null;
    prev: number | null;
    w1: number | null;
    m1: number | null;
    y1: number | null;
  };
  details?: Record<string, FearGreedDetail>;
  reason?: string;
};

export type OkxRow = {
  inst: string;
  success: boolean;
  price?: number;
  open?: number;
  change?: number;
  pct?: number;
  reason?: string;
};

export type MarketApiResponse = {
  success: boolean;
  date: string;
  cnnIndexes: CnnIndexes;
  cnnFearGreed: CnnFearGreed;
  okx: OkxRow[];
  // Optional extension field provided by our API for convenience
  ahr?: {
    success: boolean;
    px?: number;
    px_dt?: string;
    sma200?: number;
    valuation?: number;
    ahr?: number;
    zone?: string;
    error?: string;
  };
} | { error: true; message: string };


