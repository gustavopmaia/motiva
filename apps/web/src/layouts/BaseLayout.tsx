import { Navbar } from "@/components/ui/Navbar";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

export function BaseLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const params = new URLSearchParams(location.search);
  const tab = params.get("tab") === "gallery" ? "gallery" : "map";

  const handleTabChange = (newTab: "map" | "gallery") => {
    params.set("tab", newTab);
    navigate({ pathname: "/home", search: params.toString() });
  };

  return (
    <div>
      <Navbar currentTab={tab as "map" | "gallery"} onTabChange={handleTabChange} />
      <main style={{ paddingTop: "64px" }}>
        <Outlet context={{ tab }} />
      </main>
    </div>
  );
}
