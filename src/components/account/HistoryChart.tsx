"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { HistoryEntry } from "@/lib/storage";
import { formatMoney } from "@/lib/format";

// Register ECharts components
echarts.use([
  LineChart,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

// History entry with calculated P&L fields
type HistoryEntryWithPnl = HistoryEntry & {
  account_pnl: number;
  account_pnl_percent: number;
};

// Calculate P&L from raw history entry
function calculatePnl(entry: HistoryEntry): HistoryEntryWithPnl | null {
  const { net_liquidation, principal_sgd, usd_sgd_rate } = entry;
  if (!usd_sgd_rate || usd_sgd_rate <= 0 || !principal_sgd || principal_sgd <= 0) {
    return null;
  }
  const principal_usd = principal_sgd / usd_sgd_rate;
  const account_pnl = net_liquidation - principal_usd;
  const account_pnl_percent = (account_pnl / principal_usd) * 100;
  return { ...entry, account_pnl, account_pnl_percent };
}

export interface HistoryChartProps {
  resetTrigger?: number; // Increment to trigger reset
}

export function HistoryChart({ resetTrigger }: HistoryChartProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<ReactEChartsCore>(null);

  // Reset zoom when resetTrigger changes
  useEffect(() => {
    if (resetTrigger !== undefined && resetTrigger > 0) {
      const chart = chartRef.current?.getEchartsInstance();
      if (chart) {
        chart.dispatchAction({
          type: "dataZoom",
          start: 0,
          end: 100,
        });
      }
    }
  }, [resetTrigger]);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch("/api/history", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch history");
        const data = (await res.json()) as HistoryEntry[];
        setHistory(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    }
    void fetchHistory();
  }, []);

  const option = useMemo(() => {
    if (history.length === 0) return null;

    // Calculate P&L for each entry and filter out invalid ones
    const validHistory = history
      .filter((h) => h.datetime && typeof h.net_liquidation === "number" && !isNaN(h.net_liquidation))
      .map(calculatePnl)
      .filter((h): h is HistoryEntryWithPnl => h !== null);

    if (validHistory.length === 0) return null;

    // Build arrays with inserted zero-crossing points
    const dates: string[] = [];
    const netLiquidation: number[] = [];
    const pnlPositive: (number | null)[] = [];
    const pnlNegative: (number | null)[] = [];
    const expandedHistory: typeof validHistory = [];
    
    for (let i = 0; i < validHistory.length; i++) {
      const curr = validHistory[i];
      const currPnl = curr.account_pnl_percent;
      const prev = i > 0 ? validHistory[i - 1] : null;
      const prevPnl = prev?.account_pnl_percent ?? null;
      
      // Check for zero crossing
      if (prevPnl !== null && prevPnl * currPnl < 0) {
        // Insert interpolated zero point
        // Linear interpolation: find where line crosses 0
        const ratio = Math.abs(prevPnl) / (Math.abs(prevPnl) + Math.abs(currPnl));
        const interpNl = prev!.net_liquidation + ratio * (curr.net_liquidation - prev!.net_liquidation);
        
        // Use same datetime as current point with "(0)" suffix for uniqueness
        dates.push(curr.datetime + "*");
        netLiquidation.push(interpNl);
        pnlPositive.push(0);
        pnlNegative.push(0);
        expandedHistory.push({ ...curr, account_pnl: 0, account_pnl_percent: 0, net_liquidation: interpNl });
      }
      
      // Add current point
      dates.push(curr.datetime);
      netLiquidation.push(curr.net_liquidation);
      expandedHistory.push(curr);
      
      if (currPnl >= 0) {
        pnlPositive.push(currPnl);
        pnlNegative.push(null);
      } else {
        pnlPositive.push(null);
        pnlNegative.push(currPnl);
      }
    }
    
    // For tooltip, use expanded history
    const tooltipHistory = expandedHistory;

    // Find principal changes (deposits) - principal is in SGD
    const principalChanges: Array<{ xAxis: string; amount: number }> = [];
    for (let i = 1; i < validHistory.length; i++) {
      const prevPrincipal = validHistory[i - 1].principal_sgd ?? 0;
      const currPrincipal = validHistory[i].principal_sgd ?? 0;
      if (currPrincipal > prevPrincipal) {
        const deposit = currPrincipal - prevPrincipal;
        principalChanges.push({
          xAxis: validHistory[i].datetime,
          amount: deposit,
        });
      }
    }

    // Calculate min/max for proper scaling
    const nlMin = Math.min(...netLiquidation);
    const nlMax = Math.max(...netLiquidation);
    const allPnl = validHistory.map((h) => h.account_pnl_percent);
    const pnlPctMin = Math.min(...allPnl);
    const pnlPctMax = Math.max(...allPnl);
    // Make symmetric around 0 so the 0 line is centered
    // Use minimal padding (1.05) to avoid extending beyond data points
    const pnlAbsMax = Math.max(Math.abs(pnlPctMin), Math.abs(pnlPctMax), 0.1) * 1.05;

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        borderColor: "transparent",
        textStyle: { color: "#fff", fontSize: 12 },
        formatter: (params: Array<{ seriesName: string; value: number; axisValue: string; dataIndex: number }>) => {
          if (!params || params.length === 0) return "";
          const date = params[0].axisValue;
          const dataIndex = params[0].dataIndex;
          const entry = tooltipHistory[dataIndex];
          
          // Check if there's a deposit at this point
          const deposit = principalChanges.find((c) => c.xAxis === date);
          
          let html = `<strong>${date}</strong><br/>`;
          // Show Net Liquidation
          const nlParam = params.find((p) => p.seriesName === "Net Liquidation");
          if (nlParam) {
            html += `<span style="color:#1976d2">Net Liquidation: $${formatMoney(nlParam.value)}</span><br/>`;
          }
          
          // Show P&L (from either positive or negative series)
          const pnlParam = params.find((p) => p.seriesName?.startsWith("P&L %") && p.value != null);
          if (pnlParam || entry) {
            const pnlPercent = entry?.account_pnl_percent ?? 0;
            const pnlDollar = entry?.account_pnl ?? 0;
            const pnlColor = pnlPercent >= 0 ? "#2e7d32" : "#c62828";
            const pnlSign = pnlDollar >= 0 ? "+" : "";
            html += `<span style="color:${pnlColor}">P&L: ${pnlSign}$${formatMoney(Math.abs(pnlDollar))} (${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(2)}%)</span><br/>`;
          }
          
          // Add deposit info if present (principal is in SGD)
          if (deposit) {
            html += `<span style="color:#ff9800">Deposit: +S$${formatMoney(deposit.amount)}</span><br/>`;
          }
          
          return html;
        },
      },
      legend: {
        show: false,
      },
      grid: {
        left: 20,
        right: 20,
        top: 20,
        bottom: 60,
        show: true,
        borderColor: "#333",
        borderWidth: 1,
      },
      xAxis: [
        {
          type: "category",
          data: dates,
          axisLine: { show: false },
          axisLabel: {
            color: "#666",
            fontSize: 10,
            rotate: 45,
            formatter: (value: string) => {
              // Hide interpolated zero points (marked with *)
              if (value.endsWith("*")) {
                return "";
              }
              // Show only date part (MM-DD), no time
              if (value.includes(" ")) {
                const [date] = value.split(" ");
                return date.slice(5); // MM-DD
              }
              return value.slice(5); // MM-DD
            },
          },
          splitLine: { show: false },
        },
      ],
      yAxis: [
        {
          type: "value",
          show: false,
          min: nlMin * 0.98,
          max: nlMax * 1.02,
        },
        {
          type: "value",
          show: false,
          // Symmetric around 0 so the 0 line is centered
          min: -pnlAbsMax,
          max: pnlAbsMax,
        },
      ],
      dataZoom: [
        {
          type: "inside",
          start: 0,
          end: 100,
        },
      ],
      series: [
        {
          name: "Net Liquidation",
          type: "line",
          data: netLiquidation,
          yAxisIndex: 0,
          smooth: false,
          symbol: "none",
          lineStyle: { color: "#1976d2", width: 2 },
          markLine: {
            silent: true,
            symbol: ["circle", "none"],
            symbolSize: 8,
            z: 10,
            lineStyle: {
              color: "#ff9800",
              type: "dashed",
              width: 1,
            },
            label: {
              show: false,
            },
            data: principalChanges.map((change) => ({
              xAxis: change.xAxis,
            })),
          },
          z: 1,
        },
        {
          name: "P&L % (positive)",
          type: "line",
          data: pnlPositive,
          yAxisIndex: 1,
          smooth: false,
          symbol: "none",
          lineStyle: { color: "#2e7d32", width: 2 },
          connectNulls: false,
          z: 1,
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: {
              color: "#666",
              width: 2,
              type: "solid",
            },
            label: {
              show: false,
            },
            // Use coordinates to limit line to data range
            data: [[
              { xAxis: dates[0], yAxis: 0 },
              { xAxis: dates[dates.length - 1], yAxis: 0 },
            ]],
          },
        },
        {
          name: "P&L % (negative)",
          type: "line",
          data: pnlNegative,
          yAxisIndex: 1,
          smooth: false,
          symbol: "none",
          lineStyle: { color: "#c62828", width: 2 },
          connectNulls: false,
          z: 1,
        },
      ],
    };
  }, [history]);

  if (isLoading) {
    return (
      <div style={{ 
        width: "100%", 
        height: "100%", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        color: "#666",
      }}>
        Loading history...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        width: "100%", 
        height: "100%", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        color: "#c62828",
      }}>
        Error: {error}
      </div>
    );
  }

  if (history.length === 0 || !option) {
    return (
      <div style={{ 
        width: "100%", 
        height: "100%", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        color: "#666",
      }}>
        No history data available
      </div>
    );
  }

  return (
    <ReactEChartsCore
      ref={chartRef}
      echarts={echarts}
      option={option}
      style={{ height: "100%", width: "100%" }}
      opts={{ renderer: "canvas" }}
      notMerge={true}
    />
  );
}
