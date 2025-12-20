import type { ChartSegment } from "@/types/portfolio";
import { CHART_RADIUS, CHART_STROKE_WIDTH, SEGMENT_COLORS_DARK } from "@/lib/portfolioConfig";
import styles from "@/app/portfolio/page.module.css";

interface PortfolioChartProps {
  segments: ChartSegment[];
  circumference: number;
  separators?: number[];
  separatorColor?: string;
  separatorWidth?: number;
  isDarkMode?: boolean;
}

export function PortfolioChart({
  segments,
  circumference,
  separators,
  separatorColor,
  separatorWidth = 1,
}: PortfolioChartProps) {
  const colors = SEGMENT_COLORS_DARK;
  const defaultSeparatorColor = "#ffffff";
  
  // Map segment colors based on theme
  const mappedSegments = segments.map(segment => {
    let color = segment.color;
    if (segment.name === "cash") color = colors.cash;
    else if (segment.name === "stock_cost") color = colors.stock;
    else if (segment.name === "option_cost") color = colors.option;
    return { ...segment, color };
  });
  return (
    <div className={styles.chartWrapper}>
      <svg width={200} height={200} viewBox="0 0 200 200">
        {mappedSegments.map((segment) => (
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
        {separators?.map((separator, index) => (
          <circle
            key={`sep-${index}`}
            cx={100}
            cy={100}
            r={CHART_RADIUS}
            fill="none"
            stroke={separatorColor || defaultSeparatorColor}
            strokeWidth={separatorWidth}
            strokeDasharray={`1 ${circumference}`}
            strokeDashoffset={-separator}
            transform="rotate(-90 100 100)"
          />
        ))}
      </svg>
    </div>
  );
}

