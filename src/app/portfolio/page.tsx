"use client";

import { useCallback, useMemo, useState } from "react";
import styles from "./page.module.css";

type Position = {
  symbol: string;
  secType: "STK" | "OPT";
  qty: number;
  cost: number;
  price: number;
  upnl: number;
  is_option: boolean;
  delta: number;
  gamma: number;
  theta: number;
  percent_change: number;
  right?: "C" | "P";
  strike?: number;
  expiry?: string;
};

type ChartSegment = {
  name: string;
  pct: number;
  color: string;
  arc: number;
  offset: number;
  value: number;
};

type PortfolioData = {
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
};

const formatMoney = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatPercent = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

const formatNumber = (value: number, digits = 2) =>
  value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const formatExpiry = (expiry?: string) => {
  if (!expiry || expiry.length !== 8) return "-";
  return `${expiry.slice(0, 4)}-${expiry.slice(4, 6)}-${expiry.slice(6, 8)}`;
};

const buildAuthHeader = (password: string) => {
  const token = typeof window !== "undefined" ? window.btoa(`portfolio:${password}`) : Buffer.from(`portfolio:${password}`).toString("base64");
  return `Basic ${token}`;
};

export default function PortfolioPage() {
  const [passwordInput, setPasswordInput] = useState("");
  const [password, setPassword] = useState<string | null>(null);
  const [data, setData] = useState<PortfolioData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPortfolio = useCallback(
    async (pw: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/portfolio", {
          headers: {
            Authorization: buildAuthHeader(pw),
          },
        });

        if (response.status === 401) {
          throw new Error("Incorrect password. Please try again.");
        }

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Failed to load portfolio data.");
        }

        const payload = (await response.json()) as PortfolioData;
        setData(payload);
        setPassword(pw);
      } catch (err) {
        setData(null);
        setPassword(null);
        setError(err instanceof Error ? err.message : "Unknown error occurred.");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!passwordInput) return;
      await fetchPortfolio(passwordInput);
    },
    [fetchPortfolio, passwordInput]
  );

  const handleRefresh = useCallback(async () => {
    if (!password) return;
    await fetchPortfolio(password);
  }, [fetchPortfolio, password]);

  const summaryItems = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Net Liquidation", display: `$${formatMoney(data.net_liquidation)}` },
      {
        label: "Unrealized PnL",
        display: `$${formatMoney(data.total_upnl)}`,
        isUpnl: true as const,
        numericValue: data.total_upnl,
      },
      { label: "Total Theta", display: `$${formatMoney(data.total_theta)}` },
      { label: "Utilization", display: formatPercent(data.utilization * 100) },
    ];
  }, [data]);

  const segmentsByName = useMemo(() => {
    if (!data) return new Map<string, ChartSegment>();
    return new Map(data.chart_segments.map((segment) => [segment.name, segment]));
  }, [data]);

  if (!password || !data) {
    return (
      <main className={styles.page}>
        <form className={styles.authCard} onSubmit={handleSubmit}>
          <h1 className={styles.authTitle}>Portfolio Access</h1>
          <p className={styles.authHint}>Enter the portfolio password to continue.</p>
          <input
            type="password"
            value={passwordInput}
            onChange={(event) => setPasswordInput(event.target.value)}
            placeholder="Password"
            className={styles.authInput}
            disabled={isLoading}
          />
          {error && <div className={styles.authError}>{error}</div>}
          <button type="submit" className={styles.authButton} disabled={isLoading || !passwordInput}>
            {isLoading ? "Verifying..." : "Unlock Portfolio"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Portfolio Dashboard</h1>
          <button className={styles.refreshButton} onClick={handleRefresh} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
        </header>

        <section className={styles.chartContainer}>
          <div className={styles.summaryStack}>
            {summaryItems.map((item) => {
              const className =
                item.isUpnl && typeof item.numericValue === "number"
                  ? `${styles.summaryValue} ${item.numericValue >= 0 ? styles.positive : styles.negative}`
                  : styles.summaryValue;
              const displayValue = item.display;
              return (
                <div key={item.label} className={styles.summaryItem}>
                  <div className={styles.summaryLabel}>{item.label}</div>
                  <div className={className}>{displayValue}</div>
                </div>
              );
            })}
          </div>

          <div className={styles.chartSection}>
            <div className={styles.chartWrapper}>
              <svg width={200} height={200} viewBox="0 0 200 200">
                {data.chart_segments.map((segment) => (
                  <circle
                    key={segment.name}
                    cx={100}
                    cy={100}
                    r={80}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={30}
                    strokeDasharray={`${segment.arc} ${data.circumference}`}
                    strokeDashoffset={-segment.offset}
                    transform="rotate(-90 100 100)"
                  />
                ))}
              </svg>
            </div>

            <table className={styles.chartLegend}>
              <tbody>
                <tr className={styles.legendRow}>
                  <td className={styles.legendColorCell}>
                    <span className={styles.legendColor} style={{ backgroundColor: "#d4d4d4" }} />
                  </td>
                  <td className={styles.legendLabel}>Cash</td>
                  <td className={styles.legendPercent}>
                    {formatPercent((segmentsByName.get("cash")?.pct ?? 0))}
                  </td>
                  <td className={styles.legendAmount}>
                    {formatMoney(segmentsByName.get("cash")?.value ?? 0)}
                  </td>
                </tr>
                <tr className={styles.legendRow}>
                  <td className={styles.legendColorCell}>
                    <span className={styles.legendColor} style={{ backgroundColor: "#a3a3a3" }} />
                  </td>
                  <td className={styles.legendLabel}>Stock</td>
                  <td className={styles.legendPercent}>
                    {formatPercent((segmentsByName.get("stock")?.pct ?? 0))}
                  </td>
                  <td className={styles.legendAmount}>
                    {formatMoney(segmentsByName.get("stock")?.value ?? 0)}
                  </td>
                </tr>
                <tr className={styles.legendRow}>
                  <td className={styles.legendColorCell}>
                    <span className={styles.legendColor} style={{ backgroundColor: "#737373" }} />
                  </td>
                  <td className={styles.legendLabel}>Option</td>
                  <td className={styles.legendPercent}>
                    {formatPercent((segmentsByName.get("option")?.pct ?? 0))}
                  </td>
                  <td className={styles.legendAmount}>
                    {formatMoney(segmentsByName.get("option")?.value ?? 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <h2 className={styles.positionsTitle}>Positions</h2>
        <div className={styles.tableWrapper}>
          <table className={styles.positionsTable}>
            <thead>
              <tr>
                <th>#</th>
                <th>Type</th>
                <th>Symbol</th>
                <th>Qty</th>
                <th>Cost</th>
                <th>Mid Price</th>
                <th>% Change</th>
                <th>UPnL</th>
                <th>Right</th>
                <th>Strike</th>
                <th>Expiry</th>
                <th>Delta</th>
                <th>Gamma</th>
                <th>Theta</th>
              </tr>
            </thead>
            <tbody>
              {data.positions.map((pos, index) => (
                <tr key={`${pos.symbol}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{pos.is_option ? "OPT" : "STOCK"}</td>
                  <td>{pos.symbol}</td>
                  <td>{formatNumber(pos.qty, 0)}</td>
                  <td>{formatMoney(pos.cost)}</td>
                  <td>{formatMoney(pos.price)}</td>
                  <td className={pos.percent_change >= 0 ? styles.positive : styles.negative}>
                    {formatNumber(pos.percent_change)}%
                  </td>
                  <td className={pos.upnl >= 0 ? styles.positive : styles.negative}>{formatMoney(pos.upnl)}</td>
                  <td>{pos.is_option ? (pos.right === "C" ? "CALL" : "PUT") : "-"}</td>
                  <td>{pos.is_option && pos.strike ? formatMoney(pos.strike) : "-"}</td>
                  <td>{pos.is_option ? formatExpiry(pos.expiry) : "-"}</td>
                  <td>{formatNumber(pos.delta)}</td>
                  <td>{formatNumber(pos.gamma)}</td>
                  <td>{formatNumber(pos.theta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

