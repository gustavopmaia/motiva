import { AuthGuard } from "@/middleware/Middleware";
import { GalleryPartial } from "@/partials/Gallery";
import { MapPartial } from "@/partials/Map";
import { WorkOrdersPartial } from "@/partials/WorkOrders";
import { useOutletContext } from "react-router-dom";

export function HomePage() {
  const { tab } = useOutletContext<{ tab: "map" | "gallery" | "work_orders" }>();

  return (
    <AuthGuard access="private">
      {tab === "gallery" ? (
        <GalleryPartial />
      ) : tab === "work_orders" ? (
        <WorkOrdersPartial />
      ) : (
        <MapPartial />
      )}
    </AuthGuard>
  );
}
