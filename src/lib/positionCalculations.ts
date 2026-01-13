import type { Position } from "@/types/portfolio";

/**
 * Calculate total cost for a position
 */
export function calculateTotalCost(position: Position): number {
  return position.cost * position.qty;
}

/**
 * Calculate market value for a position
 */
export function calculateMarketValue(position: Position): number {
  return position.price * position.qty;
}

/**
 * Calculate position percentage of total portfolio
 */
export function calculatePositionPercent(
  position: Position,
  totalBalance: number
): number {
  if (totalBalance <= 0) return 0;
  const marketValue = calculateMarketValue(position);
  return (marketValue / totalBalance) * 100;
}

/**
 * Calculate total unrealized PnL from asset breakdown
 */
export function calculateTotalUnrealizedPnL(assetBreakdown: {
  stockUnrealizedPnL: number;
  optionUnrealizedPnL: number;
  cryptoUnrealizedPnL: number;
  etfUnrealizedPnL: number;
}): number {
  return (
    assetBreakdown.stockUnrealizedPnL +
    assetBreakdown.optionUnrealizedPnL +
    assetBreakdown.cryptoUnrealizedPnL +
    assetBreakdown.etfUnrealizedPnL
  );
}

/**
 * Calculate total PnL percentage
 */
export function calculateTotalPnLPercent(
  totalPnL: number,
  totalCost: number
): number {
  if (totalCost <= 0) return 0;
  return (totalPnL / totalCost) * 100;
}

/**
 * Calculate account PnL (current balance - original amount)
 */
export function calculateAccountPnL(
  currentBalance: number,
  originalAmount: number
): number {
  return currentBalance - originalAmount;
}

/**
 * Calculate account PnL percentage
 */
export function calculateAccountPnLPercent(
  accountPnL: number,
  originalAmount: number
): number {
  if (originalAmount <= 0) return 0;
  return (accountPnL / originalAmount) * 100;
}

/**
 * Calculate annualized return
 */
export function calculateAnnualizedReturn(
  currentBalance: number,
  originalAmount: number,
  daysDiff: number
): number {
  if (daysDiff <= 0 || originalAmount <= 0) return 0;
  return (Math.pow(currentBalance / originalAmount, 365 / daysDiff) - 1) * 100;
}

