import styles from "@/app/portfolio/page.module.css";
import { PortfolioChart } from "./PortfolioChart";
import type { ChartData } from "@/lib/chartCalculations";

interface PositionsChartProps {
  chartData: ChartData;
  legendItems: Array<{ key: string; label: string; percent: number; pnl: number; color: string }>;
}

export function PositionsChart({ chartData, legendItems }: PositionsChartProps) {
  return (
    <div className={styles.positionsChartContainer}>
      <h3 className={styles.positionsChartTitle}>Allocation</h3>
      <div className={styles.positionsChartWrapper}>
        <PortfolioChart
          segments={chartData.segments}
          circumference={chartData.circumference}
          pnlOverlays={chartData.pnlOverlays}
          separators={chartData.separators}
          separatorColor="#000"
          separatorWidth={1}
        />
      </div>
      <ul className={styles.positionsChartLegend}>
        {legendItems.map((item) => (
          <li key={item.key}>
            <span className={styles.positionsChartLegendColor} style={{ backgroundColor: item.color }} />
            <span className={styles.positionsChartLegendLabel}>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

