import type { ChartSegment } from "@/types/portfolio";
import { CHART_RADIUS, CHART_STROKE_WIDTH } from "@/lib/portfolioConfig";
import styles from "@/app/portfolio/page.module.css";

interface PortfolioChartProps {
  segments: ChartSegment[];
  circumference: number;
  pnlOverlays?: Array<{ name: string; offset: number; arc: number; color: string }>;
  separators?: number[];
  separatorColor?: string;
  separatorWidth?: number;
}

export function PortfolioChart({
  segments,
  circumference,
  pnlOverlays,
  separators,
  separatorColor = "#ffffff",
  separatorWidth = 1,
}: PortfolioChartProps) {
  return (
    <div className={styles.chartSection}>
      <div className={styles.chartWrapper}>
        <svg width={200} height={200} viewBox="0 0 200 200">
          {segments.map((segment) => (
            <circle
              key={segment.name}
              cx={100}
              cy={100}
              r={CHART_RADIUS}
              fill="none"
              stroke={segment.color}
              strokeWidth={CHART_STROKE_WIDTH}
              strokeDasharray={`${segment.arc} ${circumference}`}
              strokeDashoffset={-segment.offset}
              transform="rotate(-90 100 100)"
            />
          ))}
          {pnlOverlays?.map((overlay) => (
            <circle
              key={overlay.name}
              cx={100}
              cy={100}
              r={CHART_RADIUS}
              fill="none"
              stroke={overlay.color}
              strokeWidth={CHART_STROKE_WIDTH}
              strokeDasharray={`${overlay.arc} ${circumference}`}
              strokeDashoffset={-overlay.offset}
              transform="rotate(-90 100 100)"
            />
          ))}
          {separators?.map((separator, index) => (
            <circle
              key={`sep-${index}`}
              cx={100}
              cy={100}
              r={CHART_RADIUS}
              fill="none"
              stroke={separatorColor}
              strokeWidth={separatorWidth}
              strokeDasharray={`1 ${circumference}`}
              strokeDashoffset={-separator}
              transform="rotate(-90 100 100)"
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

