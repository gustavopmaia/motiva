import Button from "@/components/ui/Button";
import { AuthGuard } from "@/middleware/Middleware";
import { useOutletContext } from "react-router-dom";

function MapPartial() {
  return (
    <div>
      <h1>Mapa</h1>
      <Button>Entrar</Button>
    </div>
  );
}

function GalleryPartial() {
  return (
    <div>
      <h1>Galeria</h1>
      <Button>Ops</Button>
    </div>
  );
}

export function HomePage() {
  const { tab } = useOutletContext<{ tab: "map" | "gallery" }>();

  return (
    <AuthGuard access="private">
      {tab === "gallery" ? <GalleryPartial /> : <MapPartial />}
    </AuthGuard>
  );
}
