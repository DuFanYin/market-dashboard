import type { SummaryItem } from "@/types/portfolio";
import type { AssetAllocation, AssetBreakdown } from "@/hooks/usePortfolioCalculations";
import { SummaryTable } from "./SummaryTable";
import { PortfolioChart } from "./PortfolioChart";
import { LegendTable } from "./LegendTable";
import styles from "@/app/portfolio/page.module.css";

interface AccountSummaryProps {
  summaryItems: SummaryItem[];
  assetAllocation: AssetAllocation[];
  assetBreakdown: AssetBreakdown;
  applyMask: (value: string) => string;
  originalAmountSgd: number;
  originalAmountUsd: number;
  currentBalanceUsd: number;
  currentBalanceSgd: number;
  isDarkMode: boolean;
  onToggleIncognito: () => void;
}

export function AccountSummary({
  summaryItems,
  assetAllocation,
  assetBreakdown,
  applyMask,
  originalAmountSgd,
  originalAmountUsd,
  currentBalanceUsd,
  currentBalanceSgd,
  isDarkMode,
  onToggleIncognito,
}: AccountSummaryProps) {
  return (
    <section className={styles.chartContainer}>
      <SummaryTable 
        items={summaryItems} 
        originalAmountSgd={originalAmountSgd}
        originalAmountUsd={originalAmountUsd}
        currentBalanceUsd={currentBalanceUsd}
        currentBalanceSgd={currentBalanceSgd}
        applyMask={applyMask}
        onToggleIncognito={onToggleIncognito}
      />
      <div className={styles.chartSection}>
        <PortfolioChart 
          assetAllocation={assetAllocation}
          isDarkMode={isDarkMode} />
      </div>
      <LegendTable assetAllocation={assetAllocation} assetBreakdown={assetBreakdown} applyMask={applyMask} />
    </section>
  );
}

