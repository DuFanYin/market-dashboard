import { fmt, fmt2 } from "@/lib/data";
import styles from "@/app/dashboard/page.module.css";

function getChangeClass(value: number) {
  return value >= 0 ? styles.positive : styles.negative;
}

function getAhrZoneClass(zone?: string) {
  if (zone === "green") return styles.ahrGreen;
  if (zone === "yellow") return styles.ahrYellow;
  if (zone === "red") return styles.ahrRed;
  return styles.ahrDefault;
}

type MarketRow = { type: "row"; key: string; name: string; current?: number; prev?: number; change?: number; pct?: number };
type MarketSpacer = { type: "spacer" };
type MarketRows = Array<MarketRow | MarketSpacer>;

type AhrData = {
  success: boolean;
  ahr?: number;
  zone?: string;
};

interface MarketsTableProps {
  rows: MarketRows;
  ahr: AhrData;
}

export function MarketsTable({ rows, ahr }: MarketsTableProps) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-1.5 sm:p-4 lg:p-6 shadow-sm overflow-x-auto order-2 sm:order-1">
      <div className="py-1 sm:py-5" />

      <table className={`w-full text-[10px] sm:text-sm min-w-[320px] sm:min-w-[500px] ${styles.tableFixed}`}>
        <colgroup>
          <col className={styles.colName} />
          <col className={styles.colNum} />
          <col className={styles.colNum} />
          <col className={styles.colNum} />
          <col className={styles.colNum} />
        </colgroup>
        <thead>
          <tr className="text-gray-500">
            <th className={`${styles.thXs} text-left`}>Name</th>
            <th className={`${styles.thXs} text-right`}>Current</th>
            <th className={`${styles.thXs} text-right`}>Prev</th>
            <th className={`${styles.thXs} text-right`}>Change</th>
            <th className={`${styles.thXs} text-right`}>% Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, idx) => (
            item.type === "spacer" ? (
              <tr key={`spacer-${idx}`}><td colSpan={5} className="py-1 sm:py-5" /></tr>
            ) : (
              <tr key={item.key} className="border-t">
                <td className={`${styles.tdName} text-gray-700 truncate`}>{item.name}</td>
                <td className={`${styles.tdNum} tabular-nums text-gray-900`}>{fmt(item.current)}</td>
                <td className={`${styles.tdNum} tabular-nums text-gray-500`}>{fmt(item.prev)}</td>
                <td className={`${styles.tdNum} tabular-nums font-medium ${getChangeClass(Number(item.change ?? 0))}`}>{Number(item.change ?? 0) >= 0 ? "+" : ""}{fmt2(item.change ?? 0)}</td>
                <td className={`${styles.tdNum} tabular-nums font-medium ${getChangeClass(Number(item.pct ?? 0))}`}>{Number(item.pct ?? 0) >= 0 ? "+" : ""}{fmt2(item.pct ?? 0)}%</td>
              </tr>
            )
          ))}

          {/* Always render AHR block with defaulted values to avoid shifts */}
          <tr>
            <td colSpan={5} className="py-1.5 sm:py-3" />
          </tr>
          <tr>
            <td colSpan={5} className="pt-1 sm:pt-2">
              <div className={`rounded-md p-1.5 sm:p-3 min-h-10 sm:min-h-16 flex items-center justify-center ${getAhrZoneClass(ahr.zone)}`}>
                <p className="text-xs sm:text-lg text-center">AHR999 Index: {fmt2(ahr.ahr)}</p>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

