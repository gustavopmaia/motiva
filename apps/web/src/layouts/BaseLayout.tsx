import { Navbar } from "@/components/ui/Navbar";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

export function BaseLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const params = new URLSearchParams(location.search);
  const rawTab = params.get("tab");
  const tab: "map" | "gallery" | "work_orders" | "reports" =
    rawTab === "gallery"
      ? "gallery"
      : rawTab === "work_orders"
        ? "work_orders"
        : rawTab === "reports"
          ? "reports"
          : "map";

  const handleTabChange = (newTab: "map" | "gallery" | "work_orders" | "reports") => {
    params.set("tab", newTab);
    navigate({ pathname: "/home", search: params.toString() });
  };

  return (
    <div>
      <Navbar currentTab={tab} onTabChange={handleTabChange} />
      <main style={{ paddingTop: "64px" }}>
        <Outlet context={{ tab }} />
      </main>
    </div>
  );
}
