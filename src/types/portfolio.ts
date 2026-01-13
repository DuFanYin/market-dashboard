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

// Portfolio YAML structure
export type PortfolioYaml = {
  timestamp: string;
  usd_sgd_rate?: number;
  usd_cny_rate?: number;
  cash: number;
  positions: RawPosition[];
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
  year_begin_balance_usd: number;
  original_amount_sgd_raw: number;
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

