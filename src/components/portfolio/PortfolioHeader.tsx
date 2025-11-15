import Link from "next/link";
import styles from "@/app/portfolio/page.module.css";

interface PortfolioHeaderProps {
  isIncognito: boolean;
  onToggleIncognito: () => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export function PortfolioHeader({ isIncognito, onToggleIncognito, onRefresh, isLoading }: PortfolioHeaderProps) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>Portfolio Dashboard</h1>
      <div style={{ display: "flex", gap: 8 }}>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 hover:bg-white/60 transition"
        >
          Switch to Dashboard
        </Link>
        <button
          className={styles.refreshButton}
          onClick={onToggleIncognito}
          style={{ backgroundColor: isIncognito ? "#4a5568" : "#e9ecef", color: isIncognito ? "#fff" : "#000" }}
        >
          {isIncognito ? "Show Values" : "Incognito"}
        </button>
        <button className={styles.refreshButton} onClick={onRefresh} disabled={isLoading}>
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>
    </header>
  );
}

