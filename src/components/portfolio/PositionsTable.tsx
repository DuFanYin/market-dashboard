import { useMemo, useState } from "react";

import type { Position } from "@/types";
import { formatMoney, formatPercent, formatNumber } from "@/lib/format";
import {
  calculateTotalCost,
  calculateMarketValue,
  calculatePositionPercent,
} from "@/lib/accountStats";
import styles from "@/app/portfolio/page.module.css";

interface PositionsTableProps {
  positions: Position[];
  netLiquidation: number;
  applyMask: (value: string) => string;
  isIncognito: boolean;
}

type SortColumn = "symbol" | "type" | "totalCost" | "market" | "upnl" | "changePercent" | "posPercent" | "delta" | "gamma" | "theta" | "dte" | "strike" | "spot" | null;
type SortDirection = "asc" | "desc" | null;

export function PositionsTable({ positions, netLiquidation, applyMask, isIncognito }: PositionsTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>("symbol");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const getTypeLabel = (secType: string) => {
    switch (secType) {
      case "OPT":
        return "Option";
      case "STK":
        return "Stock";
      case "CRYPTO":
        return "Crypto";
      case "ETF":
        return "ETF";
      default:
        return secType;
    }
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortColumn(null);
        setSortDirection(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const { orderedPositions, maxUpnl, minUpnl, maxChangePercent, minChangePercent, maxMarketValue, minMarketValue } = useMemo(() => {
    const ordered: Position[] = [...positions];

    // Apply sorting - always sort by symbol if no column is selected
    const activeSortColumn = sortColumn || "symbol";
    const activeSortDirection = sortDirection || "asc";

    ordered.sort((a, b) => {
      if (activeSortColumn === "symbol") {
        const aSymbol = a.is_option ? `${a.underlyingKey}-${a.symbol}` : a.symbol;
        const bSymbol = b.is_option ? `${b.underlyingKey}-${b.symbol}` : b.symbol;
        return activeSortDirection === "asc" 
          ? aSymbol.localeCompare(bSymbol)
          : bSymbol.localeCompare(aSymbol);
      }

      if (activeSortColumn === "type") {
        return activeSortDirection === "asc"
          ? a.secType.localeCompare(b.secType)
          : b.secType.localeCompare(a.secType);
      }

      let aValue: number;
      let bValue: number;

      switch (activeSortColumn) {
        case "totalCost":
          aValue = calculateTotalCost(a);
          bValue = calculateTotalCost(b);
          break;
        case "market":
          aValue = calculateMarketValue(a);
          bValue = calculateMarketValue(b);
          break;
        case "upnl":
          aValue = a.upnl;
          bValue = b.upnl;
          break;
        case "changePercent":
          aValue = a.percent_change;
          bValue = b.percent_change;
          break;
        case "posPercent":
          aValue = calculatePositionPercent(a, netLiquidation);
          bValue = calculatePositionPercent(b, netLiquidation);
          break;
        case "delta":
          aValue = a.delta ?? 0;
          bValue = b.delta ?? 0;
          break;
        case "gamma":
          aValue = a.gamma ?? 0;
          bValue = b.gamma ?? 0;
          break;
        case "theta":
          aValue = a.theta ?? 0;
          bValue = b.theta ?? 0;
          break;
        case "dte":
          aValue = typeof a.dteDays === "number" ? a.dteDays : -1;
          bValue = typeof b.dteDays === "number" ? b.dteDays : -1;
          break;
        case "strike":
          aValue = a.strike ?? 0;
          bValue = b.strike ?? 0;
          break;
        case "spot":
          aValue = a.underlyingPrice ?? 0;
          bValue = b.underlyingPrice ?? 0;
          break;
        default:
          return 0;
      }

      return activeSortDirection === "asc" ? aValue - bValue : bValue - aValue;
    });

    // Calculate max and min values
    const upnlValues = ordered.map(p => p.upnl);
    const changePercentValues = ordered.map(p => p.percent_change);
    const marketValues = ordered.map(p => calculateMarketValue(p));

    const maxUpnl = upnlValues.length > 0 ? Math.max(...upnlValues) : null;
    const minUpnl = upnlValues.length > 0 ? Math.min(...upnlValues) : null;
    const maxChangePercent = changePercentValues.length > 0 ? Math.max(...changePercentValues) : null;
    const minChangePercent = changePercentValues.length > 0 ? Math.min(...changePercentValues) : null;
    const maxMarketValue = marketValues.length > 0 ? Math.max(...marketValues) : null;
    const minMarketValue = marketValues.length > 0 ? Math.min(...marketValues) : null;

    return { orderedPositions: ordered, maxUpnl, minUpnl, maxChangePercent, minChangePercent, maxMarketValue, minMarketValue };
  }, [positions, sortColumn, sortDirection, netLiquidation]);

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.positionsTable}>
        <thead>
          <tr>
            <th>#</th>
            <th 
              className={styles.sortable}
              onClick={() => handleSort("symbol")}
            >
              Symbol
              {(sortColumn === "symbol" || sortColumn === null) && (
                <span className={styles.sortIndicator}>
                  {(sortDirection === "asc" || sortDirection === null) ? " ↑" : " ↓"}
                </span>
              )}
            </th>
            <th>Qty</th>
            <th 
              className={`${styles.sortable} ${styles.center}`}
              onClick={() => handleSort("type")}
            >
              Type
              {sortColumn === "type" && (
                <span className={styles.sortIndicator}>
                  {sortDirection === "asc" ? " ↑" : sortDirection === "desc" ? " ↓" : ""}
                </span>
              )}
            </th>
            <th>Price</th>
            <th>Avg. Cost</th>
            <th 
              className={styles.sortable}
              onClick={() => handleSort("totalCost")}
            >
              Total Cost
              {sortColumn === "totalCost" && (
                <span className={styles.sortIndicator}>
                  {sortDirection === "asc" ? " ↑" : sortDirection === "desc" ? " ↓" : ""}
                </span>
              )}
            </th>
            <th 
              className={styles.sortable}
              onClick={() => handleSort("market")}
            >
              Market
              {sortColumn === "market" && (
                <span className={styles.sortIndicator}>
                  {sortDirection === "asc" ? " ↑" : sortDirection === "desc" ? " ↓" : ""}
                </span>
              )}
            </th>
            <th 
              className={styles.sortable}
              onClick={() => handleSort("upnl")}
            >
              UPnL
              {sortColumn === "upnl" && (
                <span className={styles.sortIndicator}>
                  {sortDirection === "asc" ? " ↑" : sortDirection === "desc" ? " ↓" : ""}
                </span>
              )}
            </th>
            <th 
              className={styles.sortable}
              onClick={() => handleSort("changePercent")}
            >
              Change %
              {sortColumn === "changePercent" && (
                <span className={styles.sortIndicator}>
                  {sortDirection === "asc" ? " ↑" : sortDirection === "desc" ? " ↓" : ""}
                </span>
              )}
            </th>
            <th 
              className={styles.sortable}
              onClick={() => handleSort("posPercent")}
            >
              Pos %
              {sortColumn === "posPercent" && (
                <span className={styles.sortIndicator}>
                  {sortDirection === "asc" ? " ↑" : sortDirection === "desc" ? " ↓" : ""}
                </span>
              )}
            </th>
            <th 
              className={styles.sortable}
              onClick={() => handleSort("delta")}
            >
              Delta
              {sortColumn === "delta" && (
                <span className={styles.sortIndicator}>
                  {sortDirection === "asc" ? " ↑" : sortDirection === "desc" ? " ↓" : ""}
                </span>
              )}
            </th>
            <th 
              className={styles.sortable}
              onClick={() => handleSort("gamma")}
            >
              Gamma
              {sortColumn === "gamma" && (
                <span className={styles.sortIndicator}>
                  {sortDirection === "asc" ? " ↑" : sortDirection === "desc" ? " ↓" : ""}
                </span>
              )}
            </th>
            <th 
              className={styles.sortable}
              onClick={() => handleSort("theta")}
            >
              Theta
              {sortColumn === "theta" && (
                <span className={styles.sortIndicator}>
                  {sortDirection === "asc" ? " ↑" : sortDirection === "desc" ? " ↓" : ""}
                </span>
              )}
            </th>
            <th
              className={isIncognito ? undefined : styles.sortable}
              onClick={isIncognito ? undefined : () => handleSort("dte")}
            >
              DTE
              {!isIncognito && sortColumn === "dte" && (
                <span className={styles.sortIndicator}>
                  {sortDirection === "asc" ? " ↑" : sortDirection === "desc" ? " ↓" : ""}
                </span>
              )}
            </th>
            <th 
              className={styles.sortable}
              onClick={() => handleSort("strike")}
            >
              Strike
              {sortColumn === "strike" && (
                <span className={styles.sortIndicator}>
                  {sortDirection === "asc" ? " ↑" : sortDirection === "desc" ? " ↓" : ""}
                </span>
              )}
            </th>
            <th 
              className={styles.sortable}
              onClick={() => handleSort("spot")}
            >
              Spot
              {sortColumn === "spot" && (
                <span className={styles.sortIndicator}>
                  {sortDirection === "asc" ? " ↑" : sortDirection === "desc" ? " ↓" : ""}
                </span>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {orderedPositions.map((pos, index) => {
            const optionSymbol = pos.is_option && pos.strike && pos.expiry
              ? `${(pos.right ?? "").toUpperCase()}-${pos.expiry.slice(2, 4)}'${pos.expiry.slice(4, 6)}'${pos.expiry.slice(6, 8)}-${pos.strike.toFixed(2)}`
              : pos.symbol;

            return (
              <tr key={`${pos.symbol}-${index}`}>
                <td className={styles.center}>{index + 1}</td>
                <td>{pos.is_option ? `${pos.underlyingKey}-${optionSymbol}` : pos.symbol}</td>
                <td>{applyMask(formatNumber(pos.qty, pos.is_crypto ? 3 : 0))}</td>
                <td className={styles.center}>{getTypeLabel(pos.secType)}</td>
                <td>{applyMask(formatMoney(pos.price))}</td>
                <td>{applyMask(formatMoney(pos.cost))}</td>
                <td>{applyMask(formatMoney(calculateTotalCost(pos)))}</td>
                <td className={`${
                  !isIncognito && maxMarketValue !== null && calculateMarketValue(pos) === maxMarketValue ? styles.maxValue : ""
                } ${
                  !isIncognito && minMarketValue !== null && calculateMarketValue(pos) === minMarketValue ? styles.minValue : ""
                }`}>
                  {applyMask(formatMoney(calculateMarketValue(pos)))}
                </td>
                <td className={`${pos.upnl >= 0 ? styles.positive : styles.negative} ${
                  !isIncognito && maxUpnl !== null && pos.upnl === maxUpnl ? styles.maxValue : ""
                } ${
                  !isIncognito && minUpnl !== null && pos.upnl === minUpnl ? styles.minValue : ""
                }`}>
                  {applyMask(formatMoney(pos.upnl))}
                </td>
                <td className={`${pos.percent_change >= 0 ? styles.positive : styles.negative} ${
                  !isIncognito && maxChangePercent !== null && pos.percent_change === maxChangePercent ? styles.maxValue : ""
                } ${
                  !isIncognito && minChangePercent !== null && pos.percent_change === minChangePercent ? styles.minValue : ""
                }`}>
                  {`${formatNumber(pos.percent_change)}%`}
                </td>
                <td>
                  {formatPercent(calculatePositionPercent(pos, netLiquidation))}
                </td>
                <td>{applyMask(formatNumber(pos.delta))}</td>
                <td>{!pos.is_option ? "" : applyMask(formatNumber(pos.gamma))}</td>
                <td>{!pos.is_option ? "" : applyMask(formatNumber(pos.theta))}</td>
                <td>
                  {isIncognito
                    ? ""
                    : pos.is_option && typeof pos.dteDays === "number" && pos.dteDays >= 0
                      ? `${pos.dteDays}`
                      : ""}
                </td>
                <td>
                  {pos.is_option && pos.strike ? applyMask(formatMoney(pos.strike)) : ""}
                </td>
                <td>
                  {pos.is_option && pos.underlyingPrice !== undefined ? applyMask(formatMoney(pos.underlyingPrice)) : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

