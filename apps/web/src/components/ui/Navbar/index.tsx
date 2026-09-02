import { useMemo } from "react";
import { Bell } from "lucide-react";
import { jwtDecode } from "jwt-decode";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./index.module.css";

type Tab = "map" | "gallery" | "work_orders" | "reports";

interface INavbarProps {
  currentTab: Tab;
  onTabChange: (tab: Tab) => void;
}

interface TokenPayload {
  role?: string;
}

export function Navbar({ currentTab, onTabChange }: INavbarProps) {
  const { token } = useAuth();

  const isAdmin = useMemo(() => {
    if (!token) return false;
    try {
      return jwtDecode<TokenPayload>(token).role === "manager";
    } catch {
      return false;
    }
  }, [token]);

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
          {isAdmin && (
            <a
              className={`${styles.tab} ${currentTab === "reports" ? styles.active : ""}`}
              onClick={() => onTabChange("reports")}
              tabIndex={0}
            >
              Relatórios
            </a>
          )}
        </nav>
      </div>
      <div className={styles.right}>
        <Bell className={styles.icon} />
      </div>
    </header>
  );
}
