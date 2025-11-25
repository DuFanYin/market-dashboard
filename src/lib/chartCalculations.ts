import type { ChartSegment } from "@/types/portfolio";
import type { AssetBreakdown, AssetAllocation } from "@/hooks/usePortfolioCalculations";
import { CHART_RADIUS, GAIN_COLOR, LOSS_COLOR, SEGMENT_COLORS } from "./portfolioConfig";

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

export const addLossOverlay = (
  pnlOverlays: Array<{ name: string; offset: number; arc: number; color: string }>,
  cost: number,
  unrealizedPnL: number,
  segment: ChartSegment | undefined
) => {
  if (cost > 0 && unrealizedPnL < 0 && segment) {
    const lossRatio = Math.abs(unrealizedPnL) / cost;
    const lossArc = Math.min(segment.arc * lossRatio, segment.arc);
    pnlOverlays.push({ name: `${segment.name}_pnl`, offset: segment.offset, arc: lossArc, color: LOSS_COLOR });
  }
};

export type ChartData = {
  segments: ChartSegment[];
  circumference: number;
  total: number;
  pnlOverlays?: Array<{ name: string; offset: number; arc: number; color: string }>;
  separators?: number[];
};

export const buildChartFromLegendData = (
  assetAllocation: AssetAllocation[],
  assetBreakdown: AssetBreakdown,
  mode: "cost" | "market"
): ChartData => {
  const visibleAssets = assetAllocation.filter((asset) => asset.isVisible);
  if (visibleAssets.length === 0) {
    return { segments: [], circumference: 0, total: 0, pnlOverlays: [], separators: [] };
  }

  const total = mode === "cost" ? assetBreakdown.totalCost : assetBreakdown.totalMarketValue;
  const circumference = total > 0 ? 2 * Math.PI * CHART_RADIUS : 0;
  
  if (total === 0) {
    return { segments: [], circumference, total: 0, pnlOverlays: [], separators: [] };
  }

  if (mode === "market") {
    const segmentsData = visibleAssets.map((asset) => ({
      name: asset.key === "cash" ? "cash" : asset.key === "stock" ? "stock_cost" : "option_cost",
      value: asset.marketValue,
      color: asset.color,
      percent: asset.valueAllocationPercent,
    }));
    const segments = buildSegmentsFromPercent(segmentsData, circumference);
    return { segments, circumference, total, separators: calculateSeparators(segments) };
  }

  // Cost chart: use costAllocationPercent from allocation, handle gains/losses
  const segmentsData = visibleAssets.map((asset) => ({
    name: asset.key === "cash" ? "cash" : asset.key === "stock" ? "stock_cost" : "option_cost",
    value: asset.cost,
    color: asset.color,
    percent: asset.costAllocationPercent,
    unrealizedPnL: asset.unrealizedPnL,
  }));

  const segments = buildSegmentsFromPercent(segmentsData, circumference);

  const pnlOverlays: Array<{ name: string; offset: number; arc: number; color: string }> = [];
  const totalWithGains = total + Math.max(0, assetBreakdown.stockUnrealizedPnL) + Math.max(0, assetBreakdown.optionUnrealizedPnL);
  const newCircumference = totalWithGains > 0 ? 2 * Math.PI * CHART_RADIUS : circumference;

  if (totalWithGains > total) {
    const newSegments: ChartSegment[] = [];
    let newOffset = 0;
    
    for (const segmentData of segmentsData) {
      const newPercent = (segmentData.value / totalWithGains) * 100;
      if (newPercent > 0) {
        const arc = (newPercent / 100) * newCircumference;
        newSegments.push({ name: segmentData.name, value: segmentData.value, pct: newPercent, color: segmentData.color, arc, offset: newOffset });
        newOffset += arc;
      }
      
      if ((segmentData.name === "stock_cost" || segmentData.name === "option_cost") && segmentData.unrealizedPnL > 0) {
        const gainPercent = (segmentData.unrealizedPnL / totalWithGains) * 100;
        const gainArc = (gainPercent / 100) * newCircumference;
        newSegments.push({ name: `${segmentData.name.replace("_cost", "")}_gain`, value: segmentData.unrealizedPnL, pct: gainPercent, color: GAIN_COLOR, arc: gainArc, offset: newOffset });
        newOffset += gainArc;
      }
    }
    
    addLossOverlay(pnlOverlays, assetBreakdown.stockCost, assetBreakdown.stockUnrealizedPnL, newSegments.find((s) => s.name === "stock_cost"));
    addLossOverlay(pnlOverlays, assetBreakdown.optionCost, assetBreakdown.optionUnrealizedPnL, newSegments.find((s) => s.name === "option_cost"));
    
    return { segments: newSegments, circumference: newCircumference, total: totalWithGains, pnlOverlays, separators: calculateSeparators(newSegments) };
  }

  // No gains, just losses
  addLossOverlay(pnlOverlays, assetBreakdown.stockCost, assetBreakdown.stockUnrealizedPnL, segments.find((s) => s.name === "stock_cost"));
  addLossOverlay(pnlOverlays, assetBreakdown.optionCost, assetBreakdown.optionUnrealizedPnL, segments.find((s) => s.name === "option_cost"));
  
  return {
    segments,
    circumference,
    total,
    pnlOverlays,
    separators: calculateSeparators(segments),
  };
};

export type PositionGroup = {
  key: string;
  label: string;
  color: string;
  cost: number;
  marketValue: number;
  unrealizedPnL: number;
  isCash?: boolean;
};

export const buildPositionChartData = (groups: PositionGroup[]): ChartData => {
  if (groups.length === 0) {
    return { segments: [], circumference: 0, total: 0, pnlOverlays: [], separators: [] };
  }

  const totalCost = groups.reduce((sum, group) => sum + Math.abs(group.cost), 0);
  const totalGains = groups.reduce((sum, group) => sum + Math.max(0, group.unrealizedPnL), 0);
  const total = totalCost;
  const totalWithGains = total + totalGains;
  const circumference = totalWithGains > 0 ? 2 * Math.PI * CHART_RADIUS : 0;

  if (totalWithGains === 0) {
    return { segments: [], circumference, total: 0, pnlOverlays: [], separators: [] };
  }

  const pnlOverlays: Array<{ name: string; offset: number; arc: number; color: string }> = [];
  const segments: ChartSegment[] = [];
  let offset = 0;

  for (const group of groups) {
    const baseColor = group.isCash ? SEGMENT_COLORS.cash : SEGMENT_COLORS.stock;
    const basePercent = totalWithGains > 0 ? (group.cost / totalWithGains) * 100 : 0;
    if (basePercent > 0) {
      const arc = (basePercent / 100) * circumference;
      const segment = { name: group.key, value: group.cost, pct: basePercent, color: baseColor, arc, offset };
      segments.push(segment);
      addLossOverlay(pnlOverlays, group.cost, group.unrealizedPnL, segment);
      offset += arc;
    }

    if (!group.isCash && group.unrealizedPnL > 0) {
      const gainPercent = (group.unrealizedPnL / totalWithGains) * 100;
      const gainArc = (gainPercent / 100) * circumference;
      segments.push({
        name: `${group.key}_gain`,
        value: group.unrealizedPnL,
        pct: gainPercent,
        color: GAIN_COLOR,
        arc: gainArc,
        offset,
      });
      offset += gainArc;
    }
  }

  return { segments, circumference, total: totalWithGains, pnlOverlays, separators: calculateSeparators(segments) };
};

