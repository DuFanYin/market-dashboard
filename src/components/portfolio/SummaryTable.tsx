import type { SummaryItem } from "@/types/portfolio";
import styles from "@/app/portfolio/page.module.css";

interface SummaryTableProps {
  items: SummaryItem[];
}

export function SummaryTable({ items }: SummaryTableProps) {
  return (
    <div className={styles.summaryStack}>
      <table className={styles.summaryTable}>
        <tbody>
          {items.map((item) => {
            const className =
              item.isUpnl && typeof item.numericValue === "number"
                ? `${styles.summaryValue} ${item.numericValue >= 0 ? styles.positive : styles.negative}`
                : styles.summaryValue;
            return (
              <tr key={item.label} className={styles.summaryRow}>
                <td className={styles.summaryLabel}>{item.label}</td>
                <td className={className}>{item.display}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

