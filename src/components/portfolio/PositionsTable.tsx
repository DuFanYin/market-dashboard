import type { Position } from "@/types/portfolio";
import { formatMoney, formatPercent, formatNumber, formatExpiry } from "@/lib/format";
import styles from "@/app/portfolio/page.module.css";

interface PositionsTableProps {
  positions: Position[];
  netLiquidation: number;
  applyMask: (value: string) => string;
}

export function PositionsTable({ positions, netLiquidation, applyMask }: PositionsTableProps) {
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.positionsTable}>
        <thead>
          <tr>
            <th>#</th>
            <th>Type</th>
            <th>Symbol</th>
            <th>Qty</th>
            <th>Mid Price</th>
            <th>Cost</th>
            <th>Total Cost</th>
            <th>Market Value</th>
            <th>UPnL</th>
            <th>% Change</th>
            <th>Position %</th>
            <th>Right</th>
            <th>Strike</th>
            <th>Expiry</th>
            <th>Delta</th>
            <th>Gamma</th>
            <th>Theta</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos, index) => (
            <tr key={`${pos.symbol}-${index}`}>
              <td>{index + 1}</td>
              <td>{pos.is_option ? "OPT" : "STOCK"}</td>
              <td>{pos.symbol}</td>
              <td>{applyMask(formatNumber(pos.qty, 0))}</td>
              <td>{applyMask(formatMoney(pos.price))}</td>
              <td>{applyMask(formatMoney(pos.cost))}</td>
              <td>{applyMask(formatMoney(pos.cost * pos.qty))}</td>
              <td>{applyMask(formatMoney(pos.price * pos.qty))}</td>
              <td className={pos.upnl >= 0 ? styles.positive : styles.negative}>{applyMask(formatMoney(pos.upnl))}</td>
              <td className={pos.percent_change >= 0 ? styles.positive : styles.negative}>
                {formatNumber(pos.percent_change)}%
              </td>
              <td>
                {netLiquidation > 0 ? formatPercent((pos.price * pos.qty) / netLiquidation * 100) : "0.00%"}
              </td>
              <td className={!pos.is_option ? styles.center : ""}>{pos.is_option ? (pos.right === "C" ? "CALL" : "PUT") : "-"}</td>
              <td className={!(pos.is_option && pos.strike) ? styles.center : ""}>{pos.is_option && pos.strike ? applyMask(formatMoney(pos.strike)) : "-"}</td>
              <td className={!pos.is_option || !pos.expiry || pos.expiry.length !== 8 ? styles.center : ""}>{pos.is_option ? formatExpiry(pos.expiry) : "-"}</td>
              <td>{applyMask(formatNumber(pos.delta))}</td>
              <td>{applyMask(formatNumber(pos.gamma))}</td>
              <td>{applyMask(formatNumber(pos.theta))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

