// Raw position data from YAML file
export type RawPosition = {
  symbol: string;
  secType: "STK" | "OPT";
  position: number;
  avgCost: number;
  right?: "C" | "P";
  strike?: number;
  expiry?: string;
};

// Portfolio YAML structure
export type PortfolioYaml = {
  timestamp: string;
  cash: number;
  positions: RawPosition[];
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
  secType: "STK" | "OPT";
  qty: number;
  cost: number;
  price: number;
  underlyingPrice?: number;
  upnl: number;
  is_option: boolean;
  isPlaceholder?: boolean;
  delta: number;
  gamma: number;
  theta: number;
  percent_change: number;
  dteDays?: number;
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
  total_upnl: number;
  total_theta: number;
  utilization: number;
  positions: Position[];
  chart_segments: ChartSegment[];
  circumference: number;
  account_pnl: number;
  account_pnl_percent: number;
};

// Summary item for display
export type SummaryItem = {
  label: string;
  display: string;
  isUpnl?: boolean;
  numericValue?: number;
};

