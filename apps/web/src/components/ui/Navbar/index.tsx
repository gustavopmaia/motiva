import { Bell } from "lucide-react";
import styles from "./index.module.css";

interface INavbarProps {
  currentTab: "map" | "gallery" | "work_orders";
  onTabChange: (tab: "map" | "gallery" | "work_orders") => void;
}

export function Navbar({ currentTab, onTabChange }: INavbarProps) {
  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <h2 className={styles.logo}>Cultiva</h2>
        <nav className={styles.navTabs}>
          <a
            className={`${styles.tab} ${currentTab === "map" ? styles.active : ""}`}
            onClick={() => onTabChange("map")}
            tabIndex={0}
          >
            Mapa
          </a>
          <a
            className={`${styles.tab} ${currentTab === "gallery" ? styles.active : ""}`}
            onClick={() => onTabChange("gallery")}
            tabIndex={0}
          >
            Galeria
          </a>
          <a
            className={`${styles.tab} ${currentTab === "work_orders" ? styles.active : ""}`}
            onClick={() => onTabChange("work_orders")}
            tabIndex={0}
          >
            Ordens de Serviço
          </a>
        </nav>
      </div>
      <div className={styles.right}>
        <Bell className={styles.icon} />
      </div>
    </header>
  );
}
