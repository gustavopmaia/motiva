import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import useSWRImmutable from "swr/immutable";
import { jwtDecode } from "jwt-decode";
import {
  Lock,
  Unlock,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Play,
  CheckCircle,
  MapPin,
  Eye,
} from "lucide-react";
import { fetcher, api } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { AddWorkOrderModal, type AvailableWorkOrder } from "@/components/ui/AddWorkOrderModal";
import { DetailModal, type MapPointDetail } from "@/components/ui/DetailModal";
import {
  CompleteWorkOrderModal,
  type CompleteWorkOrderPayload,
} from "@/components/ui/CompleteWorkOrderModal";
import styles from "@/styles/pages/Home/WorkOrders/index.module.css";

interface RouteItem {
  workOrderId: string;
  orderIndex: number;
  workOrderStatus: "open" | "in_progress" | "completed";
  priority: "attention" | "urgent" | "critical";
  observation?: string | null;
  location?: string | null;
  segmentId: string;
  roadName: string;
  kmStart: number;
  kmEnd: number;
  scoreCurrent?: number | null;
  lat?: number | null;
  lon?: number | null;
}

interface Route {
  id: string;
  teamId: string;
  teamName: string;
  date: string;
  status: "pending_approval" | "locked";
  createdAt: string;
  items: RouteItem[];
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
  createdAt: string;
}

interface RoadSegment {
  id: string;
  roadName: string;
  kmStart: number;
  kmEnd: number;
  mowingType?: string | null;
  direction?: string | null;
  scoreCurrent?: number | null;
  image?: string | null;
}

interface TokenPayload {
  role?: string;
  email?: string;
}

function getTodayString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// sem resposta do servidor = provável falta de rede: o service worker
// enfileira a requisição (workbox background sync) e reenvia sozinho depois
function isQueuedOffline(err: unknown): boolean {
  return axios.isAxiosError(err) && !err.response;
}

export function WorkOrdersPartial() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const [selectedTeam, setSelectedTeam] = useState<string>("");

  const [selectedDetailPoint, setSelectedDetailPoint] = useState<MapPointDetail | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [completingWorkOrderId, setCompletingWorkOrderId] = useState<string | null>(null);

  const payload = useMemo(() => {
    if (!token) return null;
    try {
      return jwtDecode<TokenPayload>(token);
    } catch {
      return null;
    }
  }, [token]);

  const isAdmin = payload?.role === "manager";

  const routeEndpoint = useMemo(() => {
    if (!token) return null;
    if (selectedDate) {
      return [`/v1/routes?date=${selectedDate}`, token];
    }
    return ["/v1/routes", token];
  }, [token, selectedDate]);

  const routesCacheKey = `motiva:routes:${selectedDate}`;

  const routesFallback = useMemo(() => {
    try {
      const raw = localStorage.getItem(routesCacheKey);
      return raw ? (JSON.parse(raw) as Route[]) : undefined;
    } catch {
      return undefined;
    }
  }, [routesCacheKey]);

  const {
    data: routes,
    error: routesError,
    isLoading: routesLoading,
    mutate: mutateRoutes,
  } = useSWRImmutable<Route[]>(routeEndpoint, ([url, t]) => fetcher<Route[]>(url, t as string), {
    fallbackData: routesFallback,
    onSuccess: (data) => {
      try {
        localStorage.setItem(routesCacheKey, JSON.stringify(data));
      } catch {
        // localStorage indisponível (modo privado etc.): sem persistência, sem quebrar a tela
      }
    },
  });

  const { data: allWorkOrders, mutate: mutateWorkOrders } = useSWRImmutable<WorkOrder[]>(
    token && isAdmin ? ["/v1/work-orders", token] : null,
    ([url, t]) => fetcher<WorkOrder[]>(url, t as string),
  );

  const { data: segments } = useSWRImmutable<RoadSegment[]>(
    token ? ["/v1/road-segments", token] : null,
    ([url, t]) => fetcher<RoadSegment[]>(url, t as string),
  );

  const availableTeams = useMemo(() => {
    if (!routes) return [];
    const teamSet = new Set<string>();
    routes.forEach((r) => {
      if (r.teamName) teamSet.add(r.teamName);
    });
    return Array.from(teamSet);
  }, [routes]);

  const filteredRoutes = useMemo(() => {
    if (!routes) return [];
    if (!selectedTeam) return routes;
    return routes.filter((r) => r.teamName === selectedTeam || r.teamId === selectedTeam);
  }, [routes, selectedTeam]);

  const priorityLabelMap: Record<string, string> = {
    attention: "Atenção",
    urgent: "Urgente",
    critical: "Crítica",
  };

  const priorityClassMap: Record<string, string> = {
    attention: styles.tagAttention,
    urgent: styles.tagUrgent,
    critical: styles.tagCritical,
  };

  const woStatusLabelMap: Record<string, string> = {
    open: "Pendente",
    in_progress: "Em Progresso",
    completed: "Concluído",
  };

  const woStatusClassMap: Record<string, string> = {
    open: styles.tagOpen,
    in_progress: styles.tagInProgress,
    completed: styles.tagCompleted,
  };

  const totalTeams = filteredRoutes.length;
  const totalItems = useMemo(() => {
    return filteredRoutes.reduce((acc, r) => acc + (r.items?.length || 0), 0);
  }, [filteredRoutes]);

  const lockedRoutesCount = useMemo(() => {
    return filteredRoutes.filter((r) => r.status === "locked").length;
  }, [filteredRoutes]);

  const totalDistanceKm = useMemo(() => {
    let dist = 0;
    filteredRoutes.forEach((r) => {
      r.items?.forEach((item) => {
        dist += Math.max(0, item.kmEnd - item.kmStart);
      });
    });
    return dist.toFixed(1);
  }, [filteredRoutes]);

  const availableWorkOrdersForRoute = useMemo(() => {
    if (!allWorkOrders || !routes || !selectedRouteId) return [];
    const targetRoute = routes.find((r) => r.id === selectedRouteId);
    if (!targetRoute) return [];

    const existingWorkOrderIds = new Set(targetRoute.items.map((i) => i.workOrderId));

    return allWorkOrders
      .filter((wo) => wo.status !== "completed" && !existingWorkOrderIds.has(wo.id))
      .map(
        (wo): AvailableWorkOrder => ({
          id: wo.id,
          segmentId: wo.segmentId,
          priority: wo.priority,
          status: wo.status,
          team: wo.team,
          observation: wo.observation,
        }),
      );
  }, [allWorkOrders, routes, selectedRouteId]);

  const handleToggleLockRoute = async (route: Route) => {
    setActionError(null);
    const newStatus = route.status === "locked" ? "pending_approval" : "locked";
    try {
      await api.patch(`/v1/routes/${route.id}`, { status: newStatus });
      mutateRoutes();
    } catch {
      setActionError("Falha ao alterar status da rota.");
    }
  };

  const handleReorderItems = async (routeId: string, newItemOrder: string[]) => {
    setActionError(null);
    try {
      await api.patch(`/v1/routes/${routeId}/items`, {
        workOrderIds: newItemOrder,
      });
      mutateRoutes();
    } catch {
      setActionError("Falha ao reordenar segmentos da rota.");
    }
  };

  const handleMoveUp = (route: Route, index: number) => {
    if (index <= 0) return;
    const item = route.items[index];
    const prevItem = route.items[index - 1];

    if (item.workOrderStatus === "completed" || prevItem?.workOrderStatus === "completed") {
      return;
    }

    const currentIds = route.items.map((i) => i.workOrderId);
    const temp = currentIds[index - 1];
    currentIds[index - 1] = currentIds[index];
    currentIds[index] = temp;
    handleReorderItems(route.id, currentIds);
  };

  const handleMoveDown = (route: Route, index: number) => {
    if (index >= route.items.length - 1) return;
    const item = route.items[index];
    const nextItem = route.items[index + 1];

    if (item.workOrderStatus === "completed" || nextItem?.workOrderStatus === "completed") {
      return;
    }

    const currentIds = route.items.map((i) => i.workOrderId);
    const temp = currentIds[index + 1];
    currentIds[index + 1] = currentIds[index];
    currentIds[index] = temp;
    handleReorderItems(route.id, currentIds);
  };

  const handleRemoveSegment = (route: Route, workOrderId: string) => {
    const item = route.items.find((i) => i.workOrderId === workOrderId);
    if (item?.workOrderStatus === "completed") return;

    const updatedIds = route.items
      .filter((i) => i.workOrderId !== workOrderId)
      .map((i) => i.workOrderId);
    handleReorderItems(route.id, updatedIds);
  };

  const handleAddSegmentToRoute = (workOrderId: string) => {
    if (!selectedRouteId || !routes) return;
    const targetRoute = routes.find((r) => r.id === selectedRouteId);
    if (!targetRoute) return;

    const currentIds = targetRoute.items.map((i) => i.workOrderId);
    currentIds.push(workOrderId);
    handleReorderItems(selectedRouteId, currentIds);
  };

  const applyOptimisticStatus = (
    workOrderId: string,
    workOrderStatus: RouteItem["workOrderStatus"],
  ) => {
    mutateRoutes(
      (current) =>
        current?.map((route) => ({
          ...route,
          items: route.items.map((item) =>
            item.workOrderId === workOrderId ? { ...item, workOrderStatus } : item,
          ),
        })),
      { revalidate: false },
    );
  };

  const handleStartWorkOrder = async (workOrderId: string) => {
    setActionError(null);
    setActionMessage(null);
    try {
      await api.patch(`/v1/work-orders/${workOrderId}`, {
        status: "in_progress",
      });
      mutateRoutes();
      mutateWorkOrders();
    } catch (err) {
      if (isQueuedOffline(err)) {
        applyOptimisticStatus(workOrderId, "in_progress");
        setActionMessage("Sem conexão: início registrado, será sincronizado automaticamente.");
        return;
      }
      setActionError("Falha ao iniciar ordem de serviço.");
    }
  };

  const validationLabelMap: Record<string, string> = {
    verified: "Confirmada",
    suspicious: "Suspeita",
    missing_exif: "Sem metadados",
  };

  const handleCompleteWorkOrder = async (
    workOrderId: string,
    { photo, lat, lon, capturedAt }: CompleteWorkOrderPayload,
  ) => {
    setActionError(null);
    setActionMessage(null);

    const formData = new FormData();
    formData.append("photo", photo);
    formData.append("lat", String(lat));
    formData.append("lon", String(lon));
    formData.append("capturedAt", capturedAt);

    try {
      const result = await api.post<{ photo: { validationStatus: string } }>(
        `/v1/work-orders/${workOrderId}/complete`,
        formData,
      );
      const validationLabel =
        validationLabelMap[result.photo.validationStatus] ?? result.photo.validationStatus;
      setActionMessage(`Ordem de serviço concluída — evidência: ${validationLabel}.`);
      mutateRoutes();
      mutateWorkOrders();
    } catch (err) {
      if (isQueuedOffline(err)) {
        applyOptimisticStatus(workOrderId, "completed");
        setActionMessage("Sem conexão: conclusão registrada, será sincronizada automaticamente.");
        return;
      }
      setActionError("Falha ao concluir ordem de serviço.");
      throw new Error("complete failed");
    }
  };

  const handleOpenDetailModal = (route: Route, item: RouteItem) => {
    const matchedSeg = segments?.find((s) => s.id === item.segmentId);
    const pointDetail: MapPointDetail = {
      id: item.workOrderId,
      type: "work_order",
      title: `Ordem de Serviço - Rodovia ${item.roadName}`,
      roadName: item.roadName,
      kmStart: item.kmStart,
      kmEnd: item.kmEnd,
      mowingType: matchedSeg?.mowingType || null,
      score: item.scoreCurrent ?? null,
      level:
        item.priority === "critical"
          ? "critical"
          : item.priority === "urgent"
            ? "urgent"
            : "attention",
      status: item.workOrderStatus,
      priority: item.priority,
      team: route.teamName,
      observation: item.observation ?? null,
      location: item.location ?? null,
      direction: matchedSeg?.direction ?? null,
      createdAt: route.date,
      image: matchedSeg?.image || null,
    };
    setSelectedDetailPoint(pointDetail);
    setIsDetailModalOpen(true);
  };

  const isTodaySelected = selectedDate === getTodayString();

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Ordens de Serviço</h1>
          </div>
          <p className={styles.subtitle}>
            {isAdmin
              ? "Gerenciamento de rotas, equipes de manutenção e trechos de trabalho."
              : "Consulte os trechos de trabalho atribuídos à sua equipe e atualize o status da execução."}
          </p>
        </div>

        <div className={styles.filterBar}>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Data:</span>
            <input
              type="date"
              className={styles.filterInput}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Equipe:</span>
            <select
              className={styles.filterSelect}
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
            >
              <option value="">Todas as equipes</option>
              {availableTeams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {!isAdmin && isTodaySelected && (
            <button
              className={styles.buttonPrimary}
              onClick={() => navigate("/home?tab=map&filter=work_orders")}
              style={{ marginLeft: "auto" }}
            >
              <MapPin size={14} /> Conferir rota do dia
            </button>
          )}
        </div>

        {actionError && <p className={styles.messageError}>{actionError}</p>}
        {actionMessage && <p className={styles.messageSuccess}>{actionMessage}</p>}

        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Equipes Ativas</span>
            <span className={styles.statValue}>{totalTeams}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Total de Segmentos</span>
            <span className={styles.statValue}>{totalItems}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Trajeto Total</span>
            <span className={styles.statValue}>{totalDistanceKm} km</span>
          </div>
          {isAdmin && (
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Rotas Trancadas</span>
              <span className={styles.statValue}>{lockedRoutesCount}</span>
            </div>
          )}
        </div>

        {routesLoading && <p className={styles.message}>Carregando ordens de serviço...</p>}
        {routesError && <p className={styles.messageError}>Erro ao carregar ordens de serviço.</p>}

        {!routesLoading && !routesError && (
          <>
            {filteredRoutes.length === 0 ? (
              <p className={styles.message}>
                Nenhuma rota ou ordem de serviço encontrada para os filtros selecionados.
              </p>
            ) : (
              <div className={styles.routesList}>
                {filteredRoutes.map((route) => {
                  const isLocked = route.status === "locked";
                  const routeDistance = route.items
                    .reduce((acc, item) => acc + Math.max(0, item.kmEnd - item.kmStart), 0)
                    .toFixed(1);

                  return (
                    <div key={route.id} className={styles.teamCard}>
                      <div className={styles.teamHeader}>
                        <div className={styles.teamTitleGroup}>
                          <h2 className={styles.teamName}>{route.teamName}</h2>
                          <span
                            className={`${styles.statusBadge} ${
                              isLocked ? styles.statusLocked : styles.statusPending
                            }`}
                          >
                            {isLocked ? "Rota Trancada" : "Pendente de Aprovação"}
                          </span>
                        </div>
                        <div className={styles.teamMeta}>
                          <span>
                            Data Planejada:{" "}
                            {Intl.DateTimeFormat("pt-BR").format(
                              new Date(
                                new Date(route.date).setHours(new Date(route.date).getHours() + 3),
                              ),
                            )}
                          </span>
                          <span>Distância: {routeDistance} km</span>
                          <span>Segmentos: {route.items?.length || 0}</span>
                        </div>
                        {isAdmin && (
                          <div className={styles.teamActions}>
                            <button
                              className={isLocked ? styles.buttonSecondary : styles.buttonPrimary}
                              onClick={() => handleToggleLockRoute(route)}
                            >
                              {isLocked ? (
                                <>
                                  <Unlock size={14} /> Liberar Planejamento
                                </>
                              ) : (
                                <>
                                  <Lock size={14} /> Trancar Rota
                                </>
                              )}
                            </button>
                            <button
                              className={styles.buttonPrimary}
                              onClick={() => {
                                setSelectedRouteId(route.id);
                                setIsModalOpen(true);
                              }}
                            >
                              <Plus size={14} /> Adicionar Segmento
                            </button>
                          </div>
                        )}
                      </div>

                      <div className={styles.tableContainer}>
                        {!route.items || route.items.length === 0 ? (
                          <p className={styles.emptyTable}>
                            Nenhum segmento associado a esta rota.
                          </p>
                        ) : (
                          <table className={styles.table}>
                            <thead>
                              <tr>
                                <th>Parada</th>
                                <th>Rodovia / Trecho</th>
                                <th>Distância</th>
                                <th>Coordenadas</th>
                                <th>Prioridade</th>
                                <th>Risco Vegetação</th>
                                <th>Status</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {route.items.map((item, index) => {
                                const distance = Math.max(0, item.kmEnd - item.kmStart).toFixed(1);
                                const latFormatted =
                                  item.lat !== null && item.lat !== undefined
                                    ? item.lat.toFixed(4)
                                    : "N/D";
                                const lonFormatted =
                                  item.lon !== null && item.lon !== undefined
                                    ? item.lon.toFixed(4)
                                    : "N/D";

                                const isConcluded = item.workOrderStatus === "completed";
                                const prevItem = index > 0 ? route.items[index - 1] : null;
                                const nextItem =
                                  index < route.items.length - 1 ? route.items[index + 1] : null;

                                const canMoveUp =
                                  !isConcluded &&
                                  index > 0 &&
                                  prevItem?.workOrderStatus !== "completed";
                                const canMoveDown =
                                  !isConcluded &&
                                  index < route.items.length - 1 &&
                                  nextItem?.workOrderStatus !== "completed";

                                return (
                                  <tr key={item.workOrderId}>
                                    <td>
                                      <span className={styles.orderIndex}>{index + 1}</span>
                                    </td>
                                    <td>
                                      <strong
                                        onClick={() => handleOpenDetailModal(route, item)}
                                        style={{ cursor: "pointer", color: "var(--color-primary)" }}
                                      >
                                        {item.roadName}
                                      </strong>
                                      <br />
                                      <span
                                        style={{
                                          fontSize: "var(--font-size-xs)",
                                          color: "var(--color-text-secondary)",
                                        }}
                                      >
                                        KM {item.kmStart} até KM {item.kmEnd}
                                      </span>
                                    </td>
                                    <td>{distance} km</td>
                                    <td>
                                      <span className={styles.coordTag}>
                                        <MapPin size={12} />
                                        {latFormatted}, {lonFormatted}
                                      </span>
                                    </td>
                                    <td>
                                      <span
                                        className={`${styles.tag} ${
                                          priorityClassMap[item.priority] || ""
                                        }`}
                                      >
                                        {priorityLabelMap[item.priority] || item.priority}
                                      </span>
                                    </td>
                                    <td>
                                      {item.scoreCurrent !== null && item.scoreCurrent !== undefined
                                        ? `${item.scoreCurrent.toFixed(1)} / 100`
                                        : "N/D"}
                                    </td>
                                    <td>
                                      <span
                                        className={`${styles.tag} ${
                                          woStatusClassMap[item.workOrderStatus] || ""
                                        }`}
                                      >
                                        {woStatusLabelMap[item.workOrderStatus] ||
                                          item.workOrderStatus}
                                      </span>
                                    </td>
                                    <td>
                                      <div className={styles.actionCell}>
                                        <button
                                          className={styles.iconButton}
                                          onClick={() => handleOpenDetailModal(route, item)}
                                          title="Ver detalhes do trecho"
                                        >
                                          <Eye size={14} />
                                        </button>

                                        {isAdmin && !isConcluded && (
                                          <>
                                            {canMoveUp && (
                                              <button
                                                className={styles.iconButton}
                                                onClick={() => handleMoveUp(route, index)}
                                                title="Mover para cima"
                                              >
                                                <ArrowUp size={14} />
                                              </button>
                                            )}
                                            {canMoveDown && (
                                              <button
                                                className={styles.iconButton}
                                                onClick={() => handleMoveDown(route, index)}
                                                title="Mover para baixo"
                                              >
                                                <ArrowDown size={14} />
                                              </button>
                                            )}
                                            <button
                                              className={styles.iconButtonDanger}
                                              onClick={() =>
                                                handleRemoveSegment(route, item.workOrderId)
                                              }
                                              title="Remover segmento da rota"
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          </>
                                        )}

                                        {!isAdmin && (
                                          <>
                                            {item.workOrderStatus === "open" && (
                                              <button
                                                className={styles.buttonPrimary}
                                                onClick={() =>
                                                  handleStartWorkOrder(item.workOrderId)
                                                }
                                              >
                                                <Play size={12} /> Iniciar
                                              </button>
                                            )}
                                            {item.workOrderStatus === "in_progress" && (
                                              <button
                                                className={styles.buttonSuccess}
                                                onClick={() =>
                                                  setCompletingWorkOrderId(item.workOrderId)
                                                }
                                              >
                                                <CheckCircle size={12} /> Concluir
                                              </button>
                                            )}
                                            {item.workOrderStatus === "completed" && (
                                              <span
                                                style={{
                                                  color: "var(--color-success)",
                                                  fontWeight: "var(--font-weight-semibold)",
                                                  fontSize: "var(--font-size-xs)",
                                                  display: "inline-flex",
                                                  alignItems: "center",
                                                  gap: "var(--spacing-1)",
                                                }}
                                              >
                                                <CheckCircle size={14} /> Finalizado
                                              </span>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        <AddWorkOrderModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          workOrders={availableWorkOrdersForRoute}
          onAdd={handleAddSegmentToRoute}
        />

        <DetailModal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          point={selectedDetailPoint}
        />

        <CompleteWorkOrderModal
          isOpen={completingWorkOrderId !== null}
          onClose={() => setCompletingWorkOrderId(null)}
          onSubmit={async (payload) => {
            if (completingWorkOrderId)
              await handleCompleteWorkOrder(completingWorkOrderId, payload);
          }}
        />
      </div>
    </div>
  );
}
