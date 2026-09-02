import { MapPin, BarChart2 } from "lucide-react";
import styles from "./index.module.css";

const DIRECTION_LABELS: Record<string, string> = {
  norte: "Norte",
  sul: "Sul",
  leste: "Leste",
  oeste: "Oeste",
  unica: "Única",
};

interface RoadSegmentCardProps {
  roadName: string;
  kmStart: number;
  kmEnd: number;
  mowingType: string;
  direction?: string | null;
  scoreCurrent: number;
  scoreDivergent: boolean;
  image?: string;
}

export function RoadSegmentCard({
  roadName,
  kmStart,
  kmEnd,
  mowingType,
  direction,
  scoreCurrent,
  image,
}: RoadSegmentCardProps) {
  return (
    <div className={styles.card}>
      {image && (
        <div className={styles.imageWrapper}>
          <img src={image} alt={roadName} className={styles.image} />
        </div>
      )}
      <div className={styles.content}>
        <div className={styles.header}>
          <h3 className={styles.roadName}>{roadName}</h3>
          {direction && (
            <span className={styles.directionBadge}>
              {DIRECTION_LABELS[direction] ?? direction}
            </span>
          )}
        </div>

        <span className={styles.mowingType}>{mowingType}</span>

        <div className={styles.details}>
          <div className={styles.detailItem}>
            <MapPin size={16} className={styles.detailIcon} />
            <span className={styles.label}>
              {kmStart.toString().replace(".", ",")}
              <span>km</span> - {kmEnd.toString().replace(".", ",")}
              <span>km</span>
            </span>
          </div>
          <div className={styles.detailItem}>
            <BarChart2 size={16} className={styles.detailIcon} />
            <span className={styles.label}>Score: {scoreCurrent}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
