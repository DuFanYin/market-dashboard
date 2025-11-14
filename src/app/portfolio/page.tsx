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

const CHART_RADIUS = 77.5;
const CHART_STROKE_WIDTH = 35;
const GAIN_COLOR = "rgba(46, 125, 50, 0.6)";
const LOSS_COLOR = "rgba(198, 40, 40, 0.4)";

const buildSegments = (segmentsData: Array<{ name: string; value: number; color: string }>, total: number, circumference: number): ChartSegment[] => {
  const segments: ChartSegment[] = [];
  let offset = 0;
  for (const segment of segmentsData) {
    const pct = (segment.value / total) * 100;
    if (pct <= 0) continue;
    const arc = (pct / 100) * circumference;
    segments.push({ name: segment.name, value: segment.value, pct, color: segment.color, arc, offset });
    offset += arc;
  }
  if (segments.length > 0) {
    const totalArc = segments.reduce((sum, s) => sum + s.arc, 0);
    const remaining = circumference - totalArc;
    if (remaining > 0 && remaining < 1) segments[segments.length - 1].arc += remaining;
  }
  return segments;
};

const calculateSeparators = (segments: ChartSegment[]): number[] => {
  const separators: number[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) separators.push(segments[i].offset);
    separators.push(segments[i].offset + segments[i].arc);
  }
  return separators;
};

const addLossOverlay = (pnlOverlays: Array<{ name: string; offset: number; arc: number; color: string }>, cost: number, pnl: number, segment: ChartSegment | undefined) => {
  if (cost > 0 && pnl < 0 && segment) {
    const lossRatio = Math.abs(pnl) / cost;
    const lossArc = Math.min(segment.arc * lossRatio, segment.arc);
    pnlOverlays.push({ name: `${segment.name}_pnl`, offset: segment.offset, arc: lossArc, color: LOSS_COLOR });
  }
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

  const costBasedValues = useMemo(() => {
    if (!data) {
      return { cash: 0, stockCost: 0, optionCost: 0, totalCost: 0, stockMarketValue: 0, optionMarketValue: 0, totalMarketValue: 0, stockPnL: 0, optionPnL: 0 };
    }
    const cash = data.cash;
    let stockCost = 0, optionCost = 0, stockMarketValue = 0, optionMarketValue = 0, stockPnL = 0, optionPnL = 0;
    for (const pos of data.positions) {
      if (pos.is_option) {
        optionCost += pos.cost * pos.qty;
        optionMarketValue += pos.price * pos.qty;
        optionPnL += pos.upnl;
      } else {
        stockCost += pos.cost * pos.qty;
        stockMarketValue += pos.price * pos.qty;
        stockPnL += pos.upnl;
      }
    }
    const totalCost = cash + stockCost + optionCost;
    const totalMarketValue = cash + stockMarketValue + optionMarketValue;
    return { cash, stockCost, optionCost, totalCost, stockMarketValue, optionMarketValue, totalMarketValue, stockPnL, optionPnL };
  }, [data]);

  const costChartData = useMemo(() => {
    if (!data) {
      const circumference = 2 * Math.PI * CHART_RADIUS;
      return { segments: [], circumference, total: 0, pnlOverlays: [], separators: [], stockMarketValue: 0, optionMarketValue: 0, stockPnL: 0, optionPnL: 0, totalMarketValue: 0 };
    }
    const { cash, stockCost, optionCost, stockMarketValue, optionMarketValue, stockPnL, optionPnL, totalMarketValue } = costBasedValues;
    const total = cash + stockCost + optionCost;
    const circumference = total > 0 ? 2 * Math.PI * CHART_RADIUS : 0;
    if (total === 0) {
      return { segments: [], circumference, total: 0, pnlOverlays: [], separators: [], stockMarketValue, optionMarketValue, stockPnL, optionPnL, totalMarketValue };
    }

    const segmentsData = [
      { name: "cash" as const, value: cash, color: "#d4d4d4" },
      { name: "stock_cost" as const, value: stockCost, color: "#a3a3a3" },
      { name: "option_cost" as const, value: optionCost, color: "#737373" },
    ];
    const segments = buildSegments(segmentsData, total, circumference);
    const pnlOverlays: Array<{ name: string; offset: number; arc: number; color: string }> = [];
    const totalWithGains = total + Math.max(0, stockPnL) + Math.max(0, optionPnL);
    const newCircumference = totalWithGains > 0 ? 2 * Math.PI * CHART_RADIUS : circumference;

    if (totalWithGains > total) {
      const newSegments: ChartSegment[] = [];
      let newOffset = 0;
      for (const seg of segmentsData) {
        const pct = (seg.value / totalWithGains) * 100;
        if (pct > 0) {
        const arc = (pct / 100) * newCircumference;
          newSegments.push({ name: seg.name, value: seg.value, pct, color: seg.color, arc, offset: newOffset });
        newOffset += arc;
        }
        if (seg.name === "stock_cost" && stockPnL > 0) {
          const gainPct = (stockPnL / totalWithGains) * 100;
          const gainArc = (gainPct / 100) * newCircumference;
          newSegments.push({ name: "stock_gain", value: stockPnL, pct: gainPct, color: GAIN_COLOR, arc: gainArc, offset: newOffset });
          newOffset += gainArc;
        } else if (seg.name === "option_cost" && optionPnL > 0) {
          const gainPct = (optionPnL / totalWithGains) * 100;
          const gainArc = (gainPct / 100) * newCircumference;
          newSegments.push({ name: "option_gain", value: optionPnL, pct: gainPct, color: GAIN_COLOR, arc: gainArc, offset: newOffset });
          newOffset += gainArc;
        }
      }
      addLossOverlay(pnlOverlays, stockCost, stockPnL, newSegments.find((s) => s.name === "stock_cost"));
      addLossOverlay(pnlOverlays, optionCost, optionPnL, newSegments.find((s) => s.name === "option_cost"));
      return { segments: newSegments, circumference: newCircumference, total: totalWithGains, pnlOverlays, separators: calculateSeparators(newSegments), stockMarketValue, optionMarketValue, stockPnL, optionPnL, totalMarketValue };
    }

    addLossOverlay(pnlOverlays, stockCost, stockPnL, segments.find((s) => s.name === "stock_cost"));
    addLossOverlay(pnlOverlays, optionCost, optionPnL, segments.find((s) => s.name === "option_cost"));
    return { segments, circumference, total, pnlOverlays, separators: calculateSeparators(segments), stockMarketValue, optionMarketValue, stockPnL, optionPnL, totalMarketValue };
  }, [data, costBasedValues]);

  const marketChartData = useMemo(() => {
    if (!data) {
      return { segments: [], circumference: 2 * Math.PI * CHART_RADIUS, total: 0, separators: [] };
    }
    const { cash, stockMarketValue, optionMarketValue, totalMarketValue } = costBasedValues;
    const total = totalMarketValue;
    const circumference = total > 0 ? 2 * Math.PI * CHART_RADIUS : 0;
    if (total === 0) return { segments: [], circumference, total: 0, separators: [] };
    const segmentsData = [
      { name: "cash" as const, value: cash, color: "#d4d4d4" },
      { name: "stock_cost" as const, value: stockMarketValue, color: "#a3a3a3" },
      { name: "option_cost" as const, value: optionMarketValue, color: "#737373" },
    ];
    const segments = buildSegments(segmentsData, total, circumference);
    return { segments, circumference, total, separators: calculateSeparators(segments) };
  }, [data, costBasedValues]);

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
            <table className={styles.summaryTable}>
              <tbody>
                {summaryItems.map((item) => {
                  const className =
                    item.isUpnl && typeof item.numericValue === "number"
                      ? `${styles.summaryValue} ${item.numericValue >= 0 ? styles.positive : styles.negative}`
                      : styles.summaryValue;
                  return (
                    <tr key={item.label} className={styles.summaryRow}>
                      <td className={styles.summaryLabel}>{item.label}</td>
                      <td className={className}>{item.display}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.chartSection}>
            <div className={styles.chartWrapper}>
              <svg width={200} height={200} viewBox="0 0 200 200">
                {/* Base segments */}
                {costChartData.segments.map((segment) => (
                  <circle
                    key={segment.name}
                    cx={100}
                    cy={100}
                    r={CHART_RADIUS}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={CHART_STROKE_WIDTH}
                    strokeDasharray={`${segment.arc} ${costChartData.circumference}`}
                    strokeDashoffset={-segment.offset}
                    transform="rotate(-90 100 100)"
                  />
                ))}
                {/* PnL overlays */}
                {costChartData.pnlOverlays?.map((overlay) => (
                  <circle
                    key={overlay.name}
                    cx={100}
                    cy={100}
                    r={CHART_RADIUS}
                    fill="none"
                    stroke={overlay.color}
                    strokeWidth={CHART_STROKE_WIDTH}
                    strokeDasharray={`${overlay.arc} ${costChartData.circumference}`}
                    strokeDashoffset={-overlay.offset}
                    transform="rotate(-90 100 100)"
                  />
                ))}
              </svg>
            </div>
          </div>

          <div className={styles.chartSection}>
            <div className={styles.chartWrapper}>
              <svg width={200} height={200} viewBox="0 0 200 200">
                {/* Base segments */}
                {marketChartData.segments.map((segment) => (
                  <circle
                    key={segment.name}
                    cx={100}
                    cy={100}
                    r={CHART_RADIUS}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={CHART_STROKE_WIDTH}
                    strokeDasharray={`${segment.arc} ${marketChartData.circumference}`}
                    strokeDashoffset={-segment.offset}
                    transform="rotate(-90 100 100)"
                  />
                ))}
              </svg>
            </div>
          </div>

          <div className={styles.legendSection}>
            <table className={styles.chartLegend}>
              <thead>
                <tr>
                  <th className={styles.legendColorCell}></th>
                  <th className={styles.legendLabel}>Label</th>
                  <th className={styles.legendAmount}>Cost</th>
                  <th className={styles.legendPercent}>Cost %</th>
                  <th className={styles.legendAmount}>PnL</th>
                  <th className={styles.legendPercent}>PnL %</th>
                  <th className={styles.legendAmount}>Market Value</th>
                  <th className={styles.legendPercent}>Value %</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { key: "cash", label: "Cash", color: "#d4d4d4", cost: costBasedValues.cash, pnl: 0, marketValue: costBasedValues.cash, show: costBasedValues.cash > 0, isCash: true },
                  { key: "stock", label: "Stock", color: "#a3a3a3", cost: costBasedValues.stockCost, pnl: costBasedValues.stockPnL, marketValue: costBasedValues.stockMarketValue, show: costBasedValues.stockCost > 0, isCash: false },
                  { key: "option", label: "Option", color: "#737373", cost: costBasedValues.optionCost, pnl: costBasedValues.optionPnL, marketValue: costBasedValues.optionMarketValue, show: costBasedValues.optionCost > 0, isCash: false },
                ].filter((row) => row.show).map((row) => (
                  <tr key={row.key} className={styles.legendRow}>
                    <td className={styles.legendColorCell}>
                      <span className={styles.legendColor} style={{ backgroundColor: row.color }} />
                    </td>
                    <td className={styles.legendLabel}>{row.label}</td>
                    <td className={styles.legendAmount}>{maskValue(`$${formatMoney(row.cost)}`)}</td>
                    <td className={styles.legendPercent}>
                      {costBasedValues.totalCost > 0 ? formatPercent((row.cost / costBasedValues.totalCost) * 100) : "0.00%"}
                    </td>
                    <td className={`${styles.legendAmount} ${row.isCash ? styles.center : ""}`} style={row.pnl !== 0 && !row.isCash ? { color: row.pnl >= 0 ? "#2e7d32" : "#c62828" } : undefined}>
                      {row.isCash ? "-" : maskValue(`${row.pnl >= 0 ? "+" : ""}$${formatMoney(row.pnl)}`)}
                    </td>
                    <td className={`${styles.legendPercent} ${row.isCash ? styles.center : ""}`} style={row.pnl !== 0 && !row.isCash ? { color: row.pnl >= 0 ? "#2e7d32" : "#c62828" } : undefined}>
                      {row.isCash ? "-" : (row.cost > 0 ? `${row.pnl >= 0 ? "+" : ""}${formatPercent((row.pnl / row.cost) * 100)}` : "0.00%")}
                    </td>
                    <td className={styles.legendAmount}>{maskValue(`$${formatMoney(row.marketValue)}`)}</td>
                    <td className={styles.legendPercent}>
                      {costBasedValues.totalMarketValue > 0 ? formatPercent((row.marketValue / costBasedValues.totalMarketValue) * 100) : "0.00%"}
                    </td>
                  </tr>
                ))}
                <tr className={styles.legendRow}>
                  <td className={styles.legendColorCell}></td>
                  <td className={styles.legendLabel} style={{ fontWeight: 600 }}>Total</td>
                  <td className={styles.legendAmount} style={{ fontWeight: 600 }}>{maskValue(`$${formatMoney(costBasedValues.totalCost)}`)}</td>
                  <td className={`${styles.legendPercent} ${styles.center}`} style={{ fontWeight: 600 }}>-</td>
                  <td className={`${styles.legendAmount} ${styles.center}`} style={{ fontWeight: 600 }}>-</td>
                  <td className={`${styles.legendPercent} ${styles.center}`} style={{ fontWeight: 600 }}>-</td>
                  <td className={styles.legendAmount} style={{ fontWeight: 600 }}>{maskValue(`$${formatMoney(costBasedValues.totalMarketValue)}`)}</td>
                  <td className={`${styles.legendPercent} ${styles.center}`} style={{ fontWeight: 600 }}>-</td>
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
                    {data.net_liquidation > 0 ? formatPercent((pos.price * pos.qty) / data.net_liquidation * 100) : "0.00%"}
                  </td>
                  <td className={!pos.is_option ? styles.center : ""}>{pos.is_option ? (pos.right === "C" ? "CALL" : "PUT") : "-"}</td>
                  <td className={!(pos.is_option && pos.strike) ? styles.center : ""}>{pos.is_option && pos.strike ? maskValue(formatMoney(pos.strike)) : "-"}</td>
                  <td className={!pos.is_option || !pos.expiry || pos.expiry.length !== 8 ? styles.center : ""}>{pos.is_option ? formatExpiry(pos.expiry) : "-"}</td>
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