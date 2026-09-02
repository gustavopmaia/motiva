import { useState, useMemo, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import useSWRImmutable from "swr/immutable";
import { fetcher } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { DetailModal, type MapPointDetail } from "@/components/ui/DetailModal";

interface RoadSegment {
  id: string;
  roadName: string;
  kmStart: number;
  kmEnd: number;
  mowingType?: string | null;
  direction?: string | null;
  scoreCurrent?: number | null;
  scoreDivergent?: boolean;
  image?: string | null;
  geometry: { coordinates: any };
}

interface Alert {
  id: string;
  segmentId: string;
  osId?: string | null;
  level: "attention" | "urgent" | "critical";
  score: number;
  createdAt: string;
  closedAt?: string | null;
}

interface WorkOrder {
  id: string;
  segmentId: string;
  alertId: string;
  status: "open" | "in_progress" | "completed";
  priority: "attention" | "urgent" | "critical";
  scoreAtCreation: number;
  team?: string | null;
  observation?: string | null;
  location?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

interface RouteItem {
  workOrderId: string;
  segmentId: string;
}

interface Route {
  id: string;
  teamId: string;
  teamName: string;
  date: string;
  items: RouteItem[];
}

interface TeamBase {
  id: string;
  name: string;
  baseLat: number;
  baseLng: number;
  roadName: string;
}

interface ProcessedPoint {
  id: string;
  position: [number, number];
  detail: MapPointDetail;
  level: "normal" | "attention" | "urgent" | "critical" | "work_order" | "base";
}

function createCustomMarkerIcon(level: ProcessedPoint["level"]) {
  let color = "#22c55e";
  let iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;

  if (level === "attention") {
    color = "#f59e0b";
    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  } else if (level === "urgent" || level === "critical") {
    color = "#ef4444";
    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  } else if (level === "work_order") {
    color = "#3b82f6";
    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
  } else if (level === "base") {
    color = "#8b5cf6";
    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/></svg>`;
  }

  const html = `
    <div style="
      background-color: ${color};
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
      border: 2px solid white;
      transition: transform 0.2s ease;
    ">
      ${iconSvg}
    </div>
  `;

  return L.divIcon({
    html,
    className: "custom-map-marker-icon",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
}

function extractSegmentCenter(seg: RoadSegment): [number, number] | null {
  if (!seg?.geometry?.coordinates) return null;
  const coords = seg.geometry.coordinates;
  if (Array.isArray(coords) && coords.length > 0) {
    const firstPoint = Array.isArray(coords[0]) ? coords[0] : coords;
    if (typeof firstPoint[0] === "number" && typeof firstPoint[1] === "number") {
      return [firstPoint[1], firstPoint[0]];
    }
  }
  return null;
}

type MarkerCategory = "team_base" | "segment" | "alert" | "work_order";

const CATEGORY_LABELS: Record<MarkerCategory, string> = {
  team_base: "Bases das equipes",
  segment: "Trechos",
  alert: "Alertas",
  work_order: "Ordens de serviço",
};

// As bases ficam bem longe uma da outra na rodovia real — sem ajustar o
// enquadramento pro conjunto de pontos, um centro fixo deixa uma delas (ou
// os dois lados da rodovia) fora da tela sem nenhum aviso visual.
function FitBoundsToPoints({ points }: { points: ProcessedPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => p.position));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
  }, [points, map]);

  return null;
}

function getSegmentCoordinates(index: number, total: number): [number, number] {
  const baseLat = -23.55052;
  const baseLon = -46.633308;
  const radius = 0.04;
  const angle = (index / Math.max(total, 1)) * 2 * Math.PI;
  const lat = baseLat + radius * Math.sin(angle);
  const lon = baseLon + radius * Math.cos(angle);
  return [lat, lon];
}

export function MapPartial() {
  const { token } = useAuth();
  const location = useLocation();
  const [selectedPoint, setSelectedPoint] = useState<MapPointDetail | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [visibleCategories, setVisibleCategories] = useState<Set<MarkerCategory>>(
    () => new Set(["team_base", "segment", "alert", "work_order"]),
  );

  const toggleCategory = (category: MarkerCategory) => {
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const workOrdersOnly = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get("filter") === "work_orders";
  }, [location.search]);

  const { data: segments } = useSWRImmutable<RoadSegment[]>(
    token ? ["/v1/road-segments", token] : null,
    ([url, t]) => fetcher<RoadSegment[]>(url, t as string),
  );

  const { data: alerts } = useSWRImmutable<Alert[]>(
    token ? ["/v1/alerts", token] : null,
    ([url, t]) => fetcher<Alert[]>(url, t as string),
  );

  const { data: workOrders } = useSWRImmutable<WorkOrder[]>(
    token ? ["/v1/work-orders", token] : null,
    ([url, t]) => fetcher<WorkOrder[]>(url, t as string),
  );

  const { data: routes } = useSWRImmutable<Route[]>(
    token && workOrdersOnly ? ["/v1/routes", token] : null,
    ([url, t]) => fetcher<Route[]>(url, t as string),
  );

  const { data: teamBases } = useSWRImmutable<TeamBase[]>(
    token ? ["/v1/teams", token] : null,
    ([url, t]) => fetcher<TeamBase[]>(url, t as string),
  );

  const points = useMemo(() => {
    const list: ProcessedPoint[] = [];

    if (teamBases && Array.isArray(teamBases)) {
      teamBases.forEach((base) => {
        list.push({
          id: `base-${base.id}`,
          position: [base.baseLat, base.baseLng],
          level: "base",
          detail: {
            id: base.id,
            type: "team_base",
            title: `Base — ${base.name}`,
            roadName: base.roadName,
            kmStart: 0,
            kmEnd: 0,
          },
        });
      });
    }

    const segMap = new Map<string, RoadSegment>();
    if (segments && Array.isArray(segments)) {
      segments.forEach((seg) => segMap.set(seg.id, seg));
    }

    const activeAlertSegIds = new Set<string>();
    const activeWoSegIds = new Set<string>();

    if (alerts && Array.isArray(alerts)) {
      alerts.forEach((alt, idx) => {
        if (alt.closedAt) return;
        const matchedSeg = segMap.get(alt.segmentId);
        if (!matchedSeg) return;

        activeAlertSegIds.add(alt.segmentId);

        const baseCoords =
          extractSegmentCenter(matchedSeg) || getSegmentCoordinates(idx, segments?.length || 10);
        const hasWo = workOrders?.some(
          (wo) => wo.segmentId === alt.segmentId && wo.status !== "completed",
        );
        const coords: [number, number] = hasWo
          ? [baseCoords[0] + 0.0006, baseCoords[1] + 0.0006]
          : baseCoords;

        const level: ProcessedPoint["level"] = alt.level || "urgent";

        list.push({
          id: `alt-${alt.id}`,
          position: coords,
          level,
          detail: {
            id: alt.id,
            type: "alert",
            title: `Alerta (${level === "critical" ? "Crítico" : level === "urgent" ? "Urgente" : "Atenção"}) - Rodovia ${matchedSeg.roadName}`,
            roadName: matchedSeg.roadName,
            kmStart: Number(matchedSeg.kmStart),
            kmEnd: Number(matchedSeg.kmEnd),
            mowingType: matchedSeg.mowingType,
            direction: matchedSeg.direction,
            score: alt.score,
            level,
            createdAt: alt.createdAt,
            image: matchedSeg.image,
          },
        });
      });
    }

    if (workOrders && Array.isArray(workOrders)) {
      workOrders.forEach((wo, idx) => {
        if (wo.status === "completed") return;
        const matchedSeg = segMap.get(wo.segmentId);
        if (!matchedSeg) return;

        activeWoSegIds.add(wo.segmentId);

        const baseCoords =
          extractSegmentCenter(matchedSeg) || getSegmentCoordinates(idx, segments?.length || 10);
        const hasAlert = activeAlertSegIds.has(wo.segmentId);
        const coords: [number, number] = hasAlert
          ? [baseCoords[0] - 0.0006, baseCoords[1] - 0.0006]
          : baseCoords;

        list.push({
          id: `wo-${wo.id}`,
          position: coords,
          level: "work_order",
          detail: {
            id: wo.id,
            type: "work_order",
            title: `Ordem de Serviço - Rodovia ${matchedSeg.roadName}`,
            roadName: matchedSeg.roadName,
            kmStart: Number(matchedSeg.kmStart),
            kmEnd: Number(matchedSeg.kmEnd),
            mowingType: matchedSeg.mowingType,
            direction: matchedSeg.direction,
            score: wo.scoreAtCreation,
            level: "work_order",
            status: wo.status,
            priority: wo.priority,
            team: wo.team,
            observation: wo.observation,
            location: wo.location,
            createdAt: wo.createdAt,
            image: matchedSeg.image,
          },
        });
      });
    }

    if (segments && Array.isArray(segments)) {
      segments.forEach((seg, idx) => {
        if (activeAlertSegIds.has(seg.id) || activeWoSegIds.has(seg.id)) {
          return;
        }

        const coords: [number, number] =
          extractSegmentCenter(seg) || getSegmentCoordinates(idx, segments.length);

        let level: ProcessedPoint["level"] = "normal";
        if (seg.scoreCurrent != null) {
          if (seg.scoreCurrent >= 75) level = "critical";
          else if (seg.scoreCurrent >= 50) level = "attention";
        }

        list.push({
          id: `seg-${seg.id}`,
          position: coords,
          level,
          detail: {
            id: seg.id,
            type: "segment",
            title: `Trecho ${seg.roadName}`,
            roadName: seg.roadName,
            kmStart: Number(seg.kmStart),
            kmEnd: Number(seg.kmEnd),
            mowingType: seg.mowingType,
            direction: seg.direction,
            score: seg.scoreCurrent,
            level,
            image: seg.image,
          },
        });
      });
    }

    return list;
  }, [segments, alerts, workOrders, teamBases]);

  const displayPoints = useMemo(() => {
    if (workOrdersOnly) {
      const teamWoIds = new Set<string>();
      if (routes && Array.isArray(routes)) {
        routes.forEach((r) => {
          r.items?.forEach((item) => {
            if (item.workOrderId) teamWoIds.add(item.workOrderId);
          });
        });
      }

      return points.filter((p) => {
        if (p.level === "base") return true;
        if (p.level !== "work_order" && p.detail.type !== "work_order") return false;
        if (teamWoIds.size > 0) {
          return teamWoIds.has(p.detail.id);
        }
        return true;
      });
    }
    return points;
  }, [points, workOrdersOnly, routes]);

  const visiblePoints = useMemo(
    () => displayPoints.filter((p) => visibleCategories.has(p.detail.type as MarkerCategory)),
    [displayPoints, visibleCategories],
  );

  const handleMarkerClick = (detail: MapPointDetail) => {
    setSelectedPoint(detail);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedPoint(null);
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "calc(100vh - 64px)" }}>
      {workOrdersOnly && (
        <div
          style={{
            position: "absolute",
            top: "16px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            backgroundColor: "var(--color-primary)",
            color: "#ffffff",
            padding: "8px 20px",
            borderRadius: "24px",
            fontSize: "13px",
            fontWeight: 600,
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
            pointerEvents: "none",
          }}
        >
          Exibindo apenas ordens de serviço da sua equipe
        </div>
      )}

      <div
        style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          zIndex: 1000,
          backgroundColor: "var(--color-surface)",
          borderRadius: "12px",
          padding: "10px 14px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          fontSize: "12px",
        }}
      >
        {(Object.keys(CATEGORY_LABELS) as MarkerCategory[]).map((category) => (
          <label
            key={category}
            style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={visibleCategories.has(category)}
              onChange={() => toggleCategory(category)}
            />
            {CATEGORY_LABELS[category]}
          </label>
        ))}
      </div>

      <MapContainer
        center={[-23.55052, -46.633308]}
        zoom={13}
        minZoom={9}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBoundsToPoints points={displayPoints} />
        {visiblePoints.map((point) => (
          <Marker
            key={point.id}
            position={point.position}
            icon={createCustomMarkerIcon(point.level)}
            eventHandlers={{
              click: () => handleMarkerClick(point.detail),
            }}
          >
            <Tooltip direction="top" offset={[0, -18]} opacity={1}>
              <div style={{ textAlign: "center", padding: "2px 4px" }}>
                <strong>{point.detail.title}</strong>
                {point.detail.type !== "team_base" && (
                  <div>
                    km {point.detail.kmStart} - km {point.detail.kmEnd}
                  </div>
                )}
              </div>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>

      <DetailModal isOpen={isModalOpen} onClose={handleCloseModal} point={selectedPoint} />
    </div>
  );
}
