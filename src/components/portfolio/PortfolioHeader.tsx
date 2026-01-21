import { useRouter } from "next/navigation";
import styles from "@/app/portfolio/page.module.css";

export function PortfolioHeader() {
  const router = useRouter();

  return (
    <header className={styles.header}>
      <div className={styles.headerTop}>
        <h1 className={styles.title} onClick={() => router.push("/dashboard")}>
          Portfolio Summary
        </h1>
      </div>
    </header>
  );
}

