/**
 * Type Definitions
 * 
 * 所有类型定义集中在此文件
 * 包含: Portfolio类型、Market类型
 */

// ========== Portfolio Types (投资组合类型) ==========

// Raw position data from YAML file
export type RawPosition = {
  symbol: string;
  secType: "STK" | "OPT" | "ETF";
  position: number;
  avgCost: number;
  right?: "C" | "P";
  strike?: number;
  expiry?: string;
};

// Raw crypto position data from YAML file
export type RawCryptoPosition = {
  symbol: string;
  position: number;
  totalCostSGD: number;
};

// IBKR account data structure
export type IBKRAccount = {
  cash: number;
  positions: RawPosition[];
};

// Exchange rates structure
export type ExchangeRates = {
  usd_sgd_rate?: number;
  usd_cny_rate?: number;
};

// Cash account structure
export type CashAccount = {
  SGD_cash?: number;
  USD_cash?: number;
};

// Account info structure
export type AccountInfo = {
  principal_SGD?: number;
  IBKR_principal_SGD?: number;
  max_value_USD?: number;
  min_value_USD?: number;
  max_drawdown_percent?: number;
};

// Portfolio data structure
export type PortfolioYaml = {
  timestamp: string;
  account_info?: AccountInfo;
  rates?: ExchangeRates;
  cash_account?: CashAccount;
  IBKR_account: IBKRAccount;
  crypto?: RawCryptoPosition[];
};

// Tradier API quote response
export type Quote = {
  symbol: string;
  bid?: number;
  ask?: number;
  greeks?: {
    delta?: number;
    gamma?: number;
    theta?: number;
  };
};

// Processed position data
export type Position = {
  symbol: string;
  secType: "STK" | "OPT" | "CRYPTO" | "ETF";
  qty: number;
  cost: number;
  price: number;
  underlyingPrice?: number;
  upnl: number;
  is_option: boolean;
  is_crypto?: boolean;
  isPlaceholder?: boolean;
  delta: number;
  gamma: number;
  theta: number;
  percent_change: number;
  dteDays?: number;
  underlyingKey?: string;
  right?: "C" | "P";
  strike?: number;
  expiry?: string;
};

// Chart segment for donut chart
export type ChartSegment = {
  name: string;
  pct: number;
  color: string;
  arc: number;
  offset: number;
  value: number;
};

// Complete portfolio data response
export type PortfolioData = {
  cash: number;
  ibkr_cash: number;
  cash_account_usd: number;
  net_liquidation: number;
  total_stock_mv: number;
  total_option_mv: number;
  total_crypto_mv: number;
  total_etf_mv: number;
  total_upnl: number;
  total_theta: number;
  utilization: number;
  positions: Position[];
  chart_segments: ChartSegment[];
  circumference: number;
  account_pnl: number;
  account_pnl_percent: number;
  usd_sgd_rate: number;
  usd_cny_rate: number;
  original_amount_sgd: number;
  original_amount_usd: number;
  principal: number;
  principal_sgd: number;
  principal_usd: number;
  ibkr_principal_usd: number;
  cash_principal_usd: number;
  crypto_principal_usd: number;
  original_amount_sgd_raw: number;
  max_value_USD?: number;
  min_value_USD?: number;
  max_drawdown_percent?: number;
  crypto_cash_usd: number;
};

// Summary item for display
export type SummaryItem = {
  label: string;
  display: string;
  isUpnl?: boolean;
  numericValue?: number;
  percentDisplay?: string;
  percentValue?: number;
};

// ========== Market Types (市场数据类型) ==========

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

export type GoldPrice = {
  success: boolean;
  inst: string;
  price?: number;
  open?: number;
  high?: number;
  low?: number;
  prev?: number;
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
  gold?: GoldPrice;
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
