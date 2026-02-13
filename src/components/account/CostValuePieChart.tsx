"use client";

import { useMemo } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { PieChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { formatMoney } from "@/lib/format";
import type { AssetBreakdown } from "@/lib/accountStats";
import { SEGMENT_COLORS } from "@/lib/accountStats";

echarts.use([PieChart, TooltipComponent, CanvasRenderer]);

export interface CostValuePieChartProps {
  /** Breakdown by asset class */
  assetBreakdown: AssetBreakdown;
  /** Optional: format USD value for display (e.g. with currency conversion) */
  formatValue?: (value: number) => string;
}

const GREEN = "#22c55e";
const RED = "#ef4444";

type CostKey = keyof AssetBreakdown;
type UpnlKey = keyof AssetBreakdown;

const ASSET_ROWS: {
  label: string;
  color: string;
  costKey: CostKey;
  mvKey: CostKey;
  upnlKey: UpnlKey | null;
}[] = [
  { label: "Cash", color: SEGMENT_COLORS.cash, costKey: "cash", mvKey: "cash", upnlKey: null },
  { label: "Stock", color: SEGMENT_COLORS.stock, costKey: "stockCost", mvKey: "stockMarketValue", upnlKey: "stockUnrealizedPnL" },
  { label: "Option", color: SEGMENT_COLORS.option, costKey: "optionCost", mvKey: "optionMarketValue", upnlKey: "optionUnrealizedPnL" },
  { label: "ETF", color: SEGMENT_COLORS.etf, costKey: "etfCost", mvKey: "etfMarketValue", upnlKey: "etfUnrealizedPnL" },
  { label: "Crypto", color: SEGMENT_COLORS.crypto, costKey: "cryptoCost", mvKey: "cryptoMarketValue", upnlKey: "cryptoUnrealizedPnL" },
];

export function CostValuePieChart({ assetBreakdown, formatValue }: CostValuePieChartProps) {
  const option = useMemo(() => {
    const fmt = (v: number) => (formatValue ? formatValue(v) : `$${formatMoney(v)}`);
    // Outer: for each asset — cost segment + that asset's U profit segment (if > 0)
    const outerData: { name: string; value: number; itemStyle: { color: string } }[] = [];
    for (const { label, color, costKey, upnlKey } of ASSET_ROWS) {
      const cost = assetBreakdown[costKey] as number;
      if (cost > 0.01) outerData.push({ name: label, value: cost, itemStyle: { color } });
      if (upnlKey) {
        const upnl = assetBreakdown[upnlKey] as number;
        if (upnl > 0.01) outerData.push({ name: `${label} profit`, value: upnl, itemStyle: { color: GREEN } });
      }
    }

    // Inner: for each asset — market value segment + that asset's U loss segment (if < 0)
    const innerData: { name: string; value: number; itemStyle: { color: string } }[] = [];
    for (const { label, color, mvKey, upnlKey } of ASSET_ROWS) {
      const mv = assetBreakdown[mvKey] as number;
      if (mv > 0.01) innerData.push({ name: label, value: mv, itemStyle: { color } });
      if (upnlKey) {
        const upnl = assetBreakdown[upnlKey] as number;
        if (upnl < -0.01) innerData.push({ name: `${label} loss`, value: Math.abs(upnl), itemStyle: { color: RED } });
      }
    }

    const emptyPlaceholder = [{ name: "—", value: 1, itemStyle: { color: "#333" } }];

    return {
      tooltip: {
        trigger: "item",
        formatter: (params: { name: string; value: number }) =>
          `${params.name}: ${fmt(params.value)}`,
      },
      series: [
        {
          type: "pie",
          radius: ["52%", "72%"],
          center: ["50%", "46%"],
          label: { show: false },
          labelLine: { show: false },
          data: outerData.length ? outerData : emptyPlaceholder,
        },
        {
          type: "pie",
          radius: ["25%", "48%"],
          center: ["50%", "46%"],
          label: { show: false },
          labelLine: { show: false },
          data: innerData.length ? innerData : emptyPlaceholder,
        },
      ],
    };
  }, [assetBreakdown, formatValue]);

  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={{ width: "100%", height: "100%", minHeight: 200 }}
      notMerge
    />
  );
}
