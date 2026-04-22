import type { ReactNode } from "react";
import styles from "./index.module.css";

type BackgroundProps = {
  children: ReactNode;
};

export function Background({ children }: BackgroundProps) {
  return (
    <div className={styles.background}>
      <div className={styles.gradient} />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
