import { AuthGuard } from "@/middleware/Middleware";
import { GalleryPartial } from "@/partials/Gallery";
import { MapPartial } from "@/partials/Map";
import styles from "@/styles/pages/Home/index.module.css";
import { useOutletContext } from "react-router-dom";

export function HomePage() {
  const { tab } = useOutletContext<{ tab: "map" | "gallery" }>();

  return (
    <AuthGuard access="private">
      <div className={styles.wrapper}>
        {tab === "gallery" ? <GalleryPartial /> : <MapPartial />}
      </div>
    </AuthGuard>
  );
}
