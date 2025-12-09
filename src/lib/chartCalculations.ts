import type { ChartSegment } from "@/types/portfolio";
import type { AssetBreakdown, AssetAllocation } from "@/hooks/usePortfolioCalculations";
import { CHART_RADIUS, SEGMENT_COLORS } from "./portfolioConfig";

const buildSegmentsFromPercent = (
  segmentsData: Array<{ name: string; value: number; color: string; percent: number }>,
  circumference: number
): ChartSegment[] => {
  const segments: ChartSegment[] = [];
  let offset = 0;
  for (const seg of segmentsData) {
    if (seg.percent <= 0) continue;
    const arc = (seg.percent / 100) * circumference;
    segments.push({ name: seg.name, value: seg.value, pct: seg.percent, color: seg.color, arc, offset });
    offset += arc;
  }
  if (segments.length > 0) {
    const totalArc = segments.reduce((sum, s) => sum + s.arc, 0);
    const remaining = circumference - totalArc;
    if (remaining > 0 && remaining < 1) segments[segments.length - 1].arc += remaining;
  }
  return segments;
};

export const calculateSeparators = (segments: ChartSegment[]): number[] => {
  const separators: number[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) separators.push(segments[i].offset);
    separators.push(segments[i].offset + segments[i].arc);
  }
  return separators;
};

export type ChartData = {
  segments: ChartSegment[];
  circumference: number;
  total: number;
  separators?: number[];
};

export const buildChartFromLegendData = (
  assetAllocation: AssetAllocation[],
  assetBreakdown: AssetBreakdown
): ChartData => {
  const visibleAssets = assetAllocation.filter((asset) => asset.isVisible);
  if (visibleAssets.length === 0) {
    return { segments: [], circumference: 0, total: 0, separators: [] };
  }

  const total = assetBreakdown.totalMarketValue;
  const circumference = total > 0 ? 2 * Math.PI * CHART_RADIUS : 0;
  
  if (total === 0) {
    return { segments: [], circumference, total: 0, separators: [] };
  }

  const segmentsData = visibleAssets.map((asset) => ({
    name: asset.key === "cash" ? "cash" : asset.key === "stock" ? "stock_cost" : "option_cost",
    value: asset.marketValue,
    color: asset.color,
    percent: asset.valueAllocationPercent,
  }));
  const segments = buildSegmentsFromPercent(segmentsData, circumference);
  return { segments, circumference, total, separators: calculateSeparators(segments) };
};


