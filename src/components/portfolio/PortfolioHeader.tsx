import { useRouter } from "next/navigation";
import styles from "@/app/portfolio/page.module.css";

interface PortfolioHeaderProps {
  isLoading: boolean;
  onDownloadClick: () => void;
}

export function PortfolioHeader({ isLoading, onDownloadClick }: PortfolioHeaderProps) {
  const router = useRouter();

  return (
    <header className={styles.header}>
      <div className={styles.headerTop}>
        <h1 className={styles.title} onClick={() => router.push("/dashboard")}>
          Portfolio
        </h1>
        <button className={styles.downloadButton} onClick={onDownloadClick}>
          Report
        </button>
      </div>
    </header>
  );
}

