import type { SummaryItem } from "@/types/portfolio";
import type { AssetAllocation, AssetBreakdown } from "@/hooks/usePortfolioCalculations";
import type { CurrencyMode } from "@/lib/currency";
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
  yearBeginBalanceSgd: number;
  onToggleIncognito: () => void;
  usdSgdRate: number;
  usdCnyRate: number;
  currencyMode: CurrencyMode;
  onToggleCurrency: () => void;
  onChartClick?: () => void;
}

export function AccountSummary({
  summaryItems,
  assetAllocation,
  assetBreakdown,
  applyMask,
  originalAmountSgd,
  originalAmountUsd,
  currentBalanceUsd,
  yearBeginBalanceSgd,
  onToggleIncognito,
  usdSgdRate,
  usdCnyRate,
  currencyMode,
  onToggleCurrency,
  onChartClick,
}: AccountSummaryProps) {
  return (
    <>
      <SummaryTable 
        items={summaryItems} 
        originalAmountUsd={originalAmountUsd}
        currentBalanceUsd={currentBalanceUsd}
        yearBeginBalanceSgd={yearBeginBalanceSgd}
        originalAmountSgd={originalAmountSgd}
        usdSgdRate={usdSgdRate}
        usdCnyRate={usdCnyRate}
        currencyMode={currencyMode}
        applyMask={applyMask}
        onToggleIncognito={onToggleIncognito}
      />
      <div className={styles.chartSection}>
        <PortfolioChart 
          assetAllocation={assetAllocation}
          onClick={onChartClick} />
      </div>
      <LegendTable 
        assetAllocation={assetAllocation} 
        assetBreakdown={assetBreakdown} 
        applyMask={applyMask}
        usdSgdRate={usdSgdRate}
        usdCnyRate={usdCnyRate}
        currencyMode={currencyMode}
        onToggleCurrency={onToggleCurrency}
      />
    </>
  );
}

