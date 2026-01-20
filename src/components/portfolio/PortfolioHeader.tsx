import { useRouter } from "next/navigation";
import styles from "@/app/portfolio/page.module.css";

interface PortfolioHeaderProps {
  onDownloadClick: () => void;
}

export function PortfolioHeader({ onDownloadClick }: PortfolioHeaderProps) {
  const router = useRouter();

  return (
    <header className={styles.header}>
      <div className={styles.headerTop}>
        <h1 className={styles.title} onClick={() => router.push("/dashboard")}>
          Portfolio Summary
        </h1>
        <button className={styles.downloadButton} onClick={onDownloadClick}>
          Data
        </button>
      </div>
    </header>
  );
}

