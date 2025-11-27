import { useMemo } from "react";

import type { Position } from "@/types/portfolio";
import { formatMoney, formatPercent, formatNumber } from "@/lib/format";
import styles from "@/app/portfolio/page.module.css";

interface PositionsTableProps {
  positions: Position[];
  netLiquidation: number;
  applyMask: (value: string) => string;
}

export function PositionsTable({ positions, netLiquidation, applyMask }: PositionsTableProps) {
  const orderedPositions = useMemo(() => {
    const groupOrder: string[] = [];
    const groups = new Map<
      string,
      {
        stock: Position[];
        options: Position[];
      }
    >();

    for (const pos of positions) {
      const key = pos.underlyingKey ?? pos.symbol;
      if (!groups.has(key)) {
        groupOrder.push(key);
        groups.set(key, { stock: [], options: [] });
      }
      const entry = groups.get(key)!;
      if (pos.is_option) {
        entry.options.push(pos);
      } else {
        entry.stock.push(pos);
      }
    }

    return groupOrder.flatMap((key) => {
      const entry = groups.get(key)!;
      return [...entry.stock, ...entry.options];
    });
  }, [positions]);

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.positionsTable}>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Cost</th>
            <th>Total</th>
            <th>Market</th>
            <th>UPnL</th>
            <th>Change</th>
            <th>Pos %</th>
            <th>Delta</th>
            <th>Gamma</th>
            <th>Theta</th>
            <th>DTE</th>
          </tr>
        </thead>
        <tbody>
          {orderedPositions.map((pos, index) => {
            const isPlaceholder = Boolean(pos.isPlaceholder);
            const optionSymbol = pos.is_option && pos.strike && pos.expiry
              ? `${(pos.right ?? "").toUpperCase()}-${pos.expiry.slice(4, 6)}/${pos.expiry.slice(6, 8)}/${pos.expiry.slice(2, 4)}-${pos.strike.toFixed(2)}`
              : pos.symbol;

            return (
              <tr key={`${pos.symbol}-${index}`} className={pos.is_option ? styles.optionRow : undefined}>
                <td>{pos.is_option ? optionSymbol : pos.symbol}</td>
                <td>{isPlaceholder ? "-" : applyMask(formatNumber(pos.qty, 0))}</td>
                <td>
                  {isPlaceholder
                    ? pos.price
                      ? applyMask(formatMoney(pos.price))
                      : "-"
                    : applyMask(formatMoney(pos.price))}
                </td>
                <td>{isPlaceholder ? "-" : applyMask(formatMoney(pos.cost))}</td>
                <td>{isPlaceholder ? "-" : applyMask(formatMoney(pos.cost * pos.qty))}</td>
                <td>{isPlaceholder ? "-" : applyMask(formatMoney(pos.price * pos.qty))}</td>
                <td className={pos.upnl >= 0 ? styles.positive : styles.negative}>
                  {isPlaceholder ? "-" : applyMask(formatMoney(pos.upnl))}
                </td>
                <td className={pos.percent_change >= 0 ? styles.positive : styles.negative}>
                  {isPlaceholder ? "-" : `${formatNumber(pos.percent_change)}%`}
                </td>
                <td>
                  {isPlaceholder
                    ? "-"
                    : netLiquidation > 0
                      ? formatPercent(((pos.price * pos.qty) / netLiquidation) * 100)
                      : "0.00%"}
                </td>
                <td>{isPlaceholder ? "-" : applyMask(formatNumber(pos.delta))}</td>
                <td>{isPlaceholder || !pos.is_option ? "-" : applyMask(formatNumber(pos.gamma))}</td>
                <td>{isPlaceholder || !pos.is_option ? "-" : applyMask(formatNumber(pos.theta))}</td>
                <td className={styles.center}>
                  {pos.is_option && typeof pos.dteDays === "number" && pos.dteDays >= 0 ? `${pos.dteDays}` : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

