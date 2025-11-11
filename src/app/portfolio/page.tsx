"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import type { ChartSegment, PortfolioData, SummaryItem } from "@/types/portfolio";

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

export default function PortfolioPage() {
  const router = useRouter();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isIncognito, setIsIncognito] = useState(false);

  const fetchPortfolio = useCallback(async (isRefresh = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/portfolio");

      if (response.status === 404) {
        // Data file doesn't exist
        if (isInitialLoad && !isRefresh) {
          // Only redirect on initial load, not on refresh
          router.push("/dashboard");
          return;
        }
        // On refresh, show error instead of redirecting
        throw new Error("Portfolio data file not found");
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to load portfolio data.");
      }

      const payload = (await response.json()) as PortfolioData;
      setData(payload);
      setIsInitialLoad(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred.");
      // Don't clear data on refresh errors, keep showing previous data
      if (isInitialLoad && !isRefresh) {
        setData(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [router, isInitialLoad]);

  useEffect(() => {
    fetchPortfolio(false);
  }, [fetchPortfolio]);

  const handleRefresh = useCallback(async () => {
    await fetchPortfolio(true);
  }, [fetchPortfolio]);

  const maskValue = useCallback(
    (value: string): string => {
      if (isIncognito) return "*";
      return value;
    },
    [isIncognito],
  );

  const summaryItems = useMemo<SummaryItem[]>(() => {
    if (!data) return [];
    return [
      { label: "Net Liquidation", display: maskValue(`$${formatMoney(data.net_liquidation)}`) },
      {
        label: "Unrealized PnL",
        display: maskValue(`$${formatMoney(data.total_upnl)}`),
        isUpnl: true as const,
        numericValue: data.total_upnl,
      },
      { label: "Total Theta", display: maskValue(`${formatMoney(data.total_theta)}`) },
      { label: "Utilization", display: formatPercent(data.utilization * 100) },
      {
        label: "Account PnL",
        display: maskValue(`$${formatMoney(data.account_pnl)}`),
        isUpnl: true as const,
        numericValue: data.account_pnl,
      },
      {
        label: "Account PnL %",
        display: formatPercent(data.account_pnl_percent),
        isUpnl: true as const,
        numericValue: data.account_pnl_percent,
      },
    ];
  }, [data, maskValue]);

  const segmentsByName = useMemo(() => {
    if (!data) return new Map<string, ChartSegment>();
    return new Map(data.chart_segments.map((segment) => [segment.name, segment]));
  }, [data]);

  if (isLoading && isInitialLoad && !data) {
    return (
      <main className={styles.page}>
        <div className={styles.container} style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "80vh" }}>
          <p>Loading portfolio data...</p>
        </div>
      </main>
    );
  }

  if (!data && !isLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.container} style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "80vh" }}>
          <p>Error: {error || "Failed to load portfolio data"}</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Portfolio Dashboard</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 hover:bg-white/60 transition"
            >
              Switch to Dashboard
            </Link>
            <button
              className={styles.refreshButton}
              onClick={() => setIsIncognito(!isIncognito)}
              style={{ backgroundColor: isIncognito ? "#4a5568" : "#e9ecef", color: isIncognito ? "#fff" : "#000" }}
            >
              {isIncognito ? "Show Values" : "Incognito"}
            </button>
            <button className={styles.refreshButton} onClick={handleRefresh} disabled={isLoading}>
              {isLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </header>
        {error && (
          <div style={{ padding: "8px", marginBottom: "8px", backgroundColor: "#fee", color: "#c00", borderRadius: "4px", fontSize: "14px" }}>
            Error refreshing: {error}
          </div>
        )}

        <h2 className={styles.positionsTitle}>Account Summary</h2>
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
                    {maskValue(formatMoney(segmentsByName.get("cash")?.value ?? 0))}
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
                    {maskValue(formatMoney(segmentsByName.get("stock")?.value ?? 0))}
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
                    {maskValue(formatMoney(segmentsByName.get("option")?.value ?? 0))}
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
                <th>Mid Price</th>
                <th>Cost</th>
                <th>Total Cost</th>
                <th>Market Value</th>
                <th>UPnL</th>
                <th>% Change</th>
                <th>Position %</th>
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
                  <td>{maskValue(formatNumber(pos.qty, 0))}</td>
                  <td>{maskValue(formatMoney(pos.price))}</td>
                  <td>{maskValue(formatMoney(pos.cost))}</td>
                  <td>{maskValue(formatMoney(pos.cost * pos.qty))}</td>
                  <td>{maskValue(formatMoney(pos.price * pos.qty))}</td>
                  <td className={pos.upnl >= 0 ? styles.positive : styles.negative}>{maskValue(formatMoney(pos.upnl))}</td>
                  <td className={pos.percent_change >= 0 ? styles.positive : styles.negative}>
                    {formatNumber(pos.percent_change)}%
                  </td>
                  <td>
                    {data.net_liquidation > 0
                      ? formatPercent((pos.price * pos.qty) / data.net_liquidation * 100)
                      : "0.00%"}
                  </td>
                  <td>{pos.is_option ? (pos.right === "C" ? "CALL" : "PUT") : "-"}</td>
                  <td>{pos.is_option && pos.strike ? maskValue(formatMoney(pos.strike)) : "-"}</td>
                  <td>{pos.is_option ? formatExpiry(pos.expiry) : "-"}</td>
                  <td>{maskValue(formatNumber(pos.delta))}</td>
                  <td>{maskValue(formatNumber(pos.gamma))}</td>
                  <td>{maskValue(formatNumber(pos.theta))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

