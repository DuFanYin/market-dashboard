import type { SummaryItem } from "@/types/portfolio";
import type { AssetAllocation, AssetBreakdown } from "@/hooks/usePortfolioCalculations";
import { SummaryTable } from "./SummaryTable";
import { PortfolioChart } from "./PortfolioChart";
import { LegendTable } from "./LegendTable";
import type { ChartSegment } from "@/types/portfolio";
import styles from "@/app/portfolio/page.module.css";

interface AccountSummaryProps {
  summaryItems: SummaryItem[];
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
  marketValueChart,
  assetAllocation,
  assetBreakdown,
  applyMask,
}: AccountSummaryProps) {
  return (
    <section className={styles.chartContainer}>
      <SummaryTable items={summaryItems} />
      <div className={styles.chartSection}>
        <PortfolioChart 
          segments={marketValueChart.segments} 
          circumference={marketValueChart.circumference} />
      </div>
      <LegendTable assetAllocation={assetAllocation} assetBreakdown={assetBreakdown} applyMask={applyMask} />
    </section>
  );
}

