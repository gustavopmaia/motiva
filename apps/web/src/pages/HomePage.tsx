import { AuthGuard } from "@/middleware/Middleware";
import { GalleryPartial } from "@/partials/Gallery";
import { MapPartial } from "@/partials/Map";
import { useOutletContext } from "react-router-dom";

export function HomePage() {
  const { tab } = useOutletContext<{ tab: "map" | "gallery" }>();

  return (
    <AuthGuard access="private">
      {tab === "gallery" ? <GalleryPartial /> : <MapPartial />}
    </AuthGuard>
  );
}
