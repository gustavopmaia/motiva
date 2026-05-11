import { Bell, Search } from "lucide-react";
import styles from "./index.module.css";
import type { InputHTMLAttributes } from "react";

interface INavbarProps {
  currentTab: "map" | "gallery";
  onTabChange: (tab: "map" | "gallery") => void;
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
        </nav>
      </div>
      <div className={styles.right}>
        <Bell className={styles.icon} />
      </div>
    </header>
  );
}

type INavInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

const NavInput = ({ label, ...props }: INavInputProps) => {
  return (
    <div className={styles.inputWrapper}>
      <span className={styles.prefixIcon}>
        <Search size={14} />
      </span>
      <input id={"coordinate"} className={styles.input} {...props} />
    </div>
  );
};
