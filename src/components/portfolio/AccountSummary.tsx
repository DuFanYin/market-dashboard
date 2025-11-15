import type { SummaryItem } from "@/types/portfolio";
import type { AssetAllocation, AssetBreakdown } from "@/hooks/usePortfolioCalculations";
import { SummaryTable } from "./SummaryTable";
import { PortfolioChart } from "./PortfolioChart";
import { LegendTable } from "./LegendTable";
import type { ChartSegment } from "@/types/portfolio";
import styles from "@/app/portfolio/page.module.css";

interface AccountSummaryProps {
  summaryItems: SummaryItem[];
  costBasisChart: {
    segments: ChartSegment[];
    circumference: number;
    pnlOverlays?: Array<{ name: string; offset: number; arc: number; color: string }>;
  };
  marketValueChart: {
    segments: ChartSegment[];
    circumference: number;
  };
  assetAllocation: AssetAllocation[];
  assetBreakdown: AssetBreakdown;
  applyMask: (value: string) => string;
}

export function AccountSummary({
  summaryItems,
  costBasisChart,
  marketValueChart,
  assetAllocation,
  assetBreakdown,
  applyMask,
}: AccountSummaryProps) {
  return (
    <section className={styles.chartContainer}>
      <SummaryTable items={summaryItems} />
      <PortfolioChart segments={costBasisChart.segments} circumference={costBasisChart.circumference} pnlOverlays={costBasisChart.pnlOverlays} />
      <PortfolioChart segments={marketValueChart.segments} circumference={marketValueChart.circumference} />
      <LegendTable assetAllocation={assetAllocation} assetBreakdown={assetBreakdown} applyMask={applyMask} />
    </section>
  );
}

