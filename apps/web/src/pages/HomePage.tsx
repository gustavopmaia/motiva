import { AuthGuard } from "@/middleware/Middleware";
import { GalleryPartial } from "@/partials/Gallery";
import { MapPartial } from "@/partials/Map";
import { WorkOrdersPartial } from "@/partials/WorkOrders";
import { ReportsPartial } from "@/partials/Reports";
import { DashboardPartial } from "@/partials/Dashboard";
import { useOutletContext } from "react-router-dom";

type Tab = "dashboard" | "map" | "gallery" | "work_orders" | "reports";

export function HomePage() {
  const { tab } = useOutletContext<{ tab: Tab }>();

  return (
    <AuthGuard access="private">
      {tab === "gallery" ? (
        <GalleryPartial />
      ) : tab === "work_orders" ? (
        <WorkOrdersPartial />
      ) : tab === "reports" ? (
        <ReportsPartial />
      ) : tab === "dashboard" ? (
        <DashboardPartial />
      ) : (
        <MapPartial />
      )}
    </AuthGuard>
  );
}
