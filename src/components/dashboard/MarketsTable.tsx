import { fmt, fmt2 } from "@/lib/data";
import styles from "@/app/dashboard/page.module.css";

function getChangeClass(value: number) {
  return value >= 0 ? styles.positive : styles.negative;
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
      <div className="py-0 sm:py-5" />

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

          
        </tbody>
      </table>


      <div className="py-0.5 sm:py-6" />
      <div>
        <div className="rounded-md p-2 sm:p-3 bg-gray-50 border border-gray-200">
          <div className="mb-2 text-xs sm:text-sm text-gray-700 text-center">
            <span className="font-semibold">AHR999 Index:</span> {fmt2(ahr.ahr)}
          </div>
          {(() => {
            const ahrValue = Number(ahr.ahr ?? 0);
            const pointerLeft = Math.min(100, Math.max(0, (ahrValue / 2) * 100));
            return (
              <>
                <div className="relative w-full h-5 sm:h-6 rounded-md overflow-hidden border border-gray-400">
                  <div className="flex h-full w-full">
                    <div className="h-full" style={{ width: "22.5%", backgroundColor: "#BBF7D0" }} />
                    <div className="h-full" style={{ width: "37.5%", backgroundColor: "#FEF08A" }} />
                    <div className="h-full" style={{ width: "40%", backgroundColor: "#FECACA" }} />
                  </div>
                  {/* Separators at 0.45 and 1.2 (22.5% and 60%) */}
                  <span className={`${styles.separator} ${styles.separatorWhite}`} style={{ left: "22.5%" }} />
                  <span className={`${styles.separator} ${styles.separatorWhite}`} style={{ left: "60%" }} />
                  {/* Pointer for current value */}
                  <span className={styles.pointer} style={{ left: `${pointerLeft}%` }} />
                </div>
                {/* Labels */}
                <div className="relative mt-1 h-4 text-[10px] sm:text-xs text-gray-500">
                  <span className="absolute left-0">0</span>
                  <span className="absolute -translate-x-1/2" style={{ left: "22.5%" }}>0.45</span>
                  <span className="absolute -translate-x-1/2" style={{ left: "60%" }}>1.2</span>
                  <span className="absolute right-0">2</span>
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </section>
  );
}

