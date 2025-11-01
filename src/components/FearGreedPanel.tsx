import { fmt2 } from "@/lib/data";
import styles from "@/app/dashboard/page.module.css";

function getFgClass(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (v >= 75) return `${styles.fgChip} ${styles.fgExtremeGreed}`;
  if (v >= 55) return `${styles.fgChip} ${styles.fgGreed}`;
  if (v >= 45) return `${styles.fgChip} ${styles.fgNeutral}`;
  if (v >= 25) return `${styles.fgChip} ${styles.fgFear}`;
  return `${styles.fgChip} ${styles.fgExtremeFear}`;
}

const INDICATORS = [
  "put_call_options",
  "market_volatility_vix",
  "market_volatility_vix_50",
  "market_momentum_sp500",
  "market_momentum_sp125",
  "stock_price_strength",
  "stock_price_breadth",
  "junk_bond_demand",
  "safe_haven_demand",
] as const;

type FearGreedData = {
  success: boolean;
  summary?: {
    score: number | null;
    rating: string | null;
    prev: number | null;
    w1: number | null;
    m1: number | null;
    y1: number | null;
  };
  details?: Record<string, { score: number | null; rating: string | null; value: number | null } | null>;
};

interface FearGreedPanelProps {
  fg: FearGreedData;
}

export function FearGreedPanel({ fg }: FearGreedPanelProps) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-1.5 sm:p-4 lg:p-6 shadow-sm space-y-2 sm:space-y-6 order-1 sm:order-2">
      {/* Summary block */}
      <div className="space-y-2 sm:space-y-4">
        {/* Score and rating */}
        <div className="flex items-center justify-center gap-2 sm:gap-3">
          <p className="text-lg sm:text-lg font-bold text-gray-900 tabular-nums">
            {fmt2(fg.summary?.score ?? 0)}
          </p>

          <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-xs sm:text-lg font-medium ${styles.noWrap} ${getFgClass(fg.summary?.score)}`}>
            {(fg.summary?.rating?.toUpperCase() ?? "UNDEFINED")}
          </span>
        </div>

        {/* Gradient bar with pointer and vertical separators */}
        <div className="relative w-full h-5 sm:h-6 rounded-md overflow-hidden border border-gray-400">
          <div className={`absolute inset-0 ${styles.fgGradient}`} />
          <div className={`${styles.separator} ${styles.sep25}`} />
          <div className={`${styles.separator} ${styles.sep45}`} />
          <div className={`${styles.separator} ${styles.sep55}`} />
          <div className={`${styles.separator} ${styles.sep75}`} />
          <div className={styles.pointer} style={{ left: `${fg.summary?.score ?? 0}%` }} />
        </div>

        {/* Historical */}
        <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm mt-2 sm:mt-4">
          {[
            { label: "Previous Close", value: fg.summary?.prev },
            { label: "1 Month Ago", value: fg.summary?.m1 },
            { label: "1 Week Ago", value: fg.summary?.w1 },
            { label: "1 Year Ago", value: fg.summary?.y1 },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center border-b pb-1">
              <span className="text-gray-600">{label}</span>
              <span className={`tabular-nums px-2 py-0.5 text-xs font-medium ${styles.noWrap} ${getFgClass(value)}`}>
                {fmt2(value ?? 0)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Component Signals */}
      <div className="mt-4 sm:mt-12 overflow-x-auto">
        <table className={`w-full text-[10px] sm:text-sm min-w-[280px] sm:min-w-[400px] ${styles.tableFixed}`}>
          <colgroup>
            <col className={styles.colComponents} />
            <col className={styles.colScore} />
            <col className={styles.colValue} />
            <col className={styles.colRating} />
          </colgroup>
          <thead>
            <tr className="text-gray-500">
              <th className="text-left py-0.5 sm:py-1 px-0.5 sm:px-1 text-[10px] sm:text-xs">Components</th>
              <th className="text-right py-0.5 sm:py-1 px-0.5 sm:px-1 text-[10px] sm:text-xs">Score</th>
              <th className="text-right py-0.5 sm:py-1 px-0.5 sm:px-1 text-[10px] sm:text-xs">Value</th>
              <th className="text-right py-0.5 sm:py-1 px-0.5 sm:px-1 text-[10px] sm:text-xs">Rating</th>
            </tr>
          </thead>
          <tbody>
            {INDICATORS.map((key) => {
              const v = (fg.details ?? {})[key] ?? null;
              return (
                <tr key={key} className="border-t dark:border-gray-700">
                  <td className="py-1 sm:py-2 text-gray-700 px-0.5 sm:px-1 text-[10px] sm:text-xs">{key}</td>
                  <td className="text-right tabular-nums text-gray-900 font-medium px-0.5 sm:px-1">{fmt2(v?.score ?? 0)}</td>
                  <td className={`text-right tabular-nums text-gray-500 px-0.5 sm:px-1 ${styles.noWrap}`}>{fmt2(v?.value ?? 0)}</td>
                  <td className={`text-right text-[9px] sm:text-xs px-0.5 sm:px-1 ${styles.noWrap}`}>
                    <span className={`px-1 sm:px-2 py-0.5 rounded-md font-medium ${styles.noWrap} ${getFgClass(v?.score)}`}>
                      {v?.rating ?? "undefined"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

