export type WorkOrderPriority = "attention" | "urgent" | "critical";
export type Team = {
  id: string;
  name: string;
  roadName: string;
  kmStart: number;
  kmEnd: number;
  capacityPerDay: number;
  baseLat: number;
  baseLng: number;
  active: boolean;
};
export type DispatchWorkOrder = {
  id: string;
  segmentId: string;
  roadName: string;
  priority: WorkOrderPriority;
  createdAt: Date;
  kmStart: number;
  kmEnd: number;
  lat: number;
  lon: number;
};

const PRIORITY_WEIGHT: Record<WorkOrderPriority, number> = {
  critical: 0,
  urgent: 1,
  attention: 2,
};

// Prazo (em dias) que cada prioridade pode ficar em aberto antes de escalar
// pro proximo nivel — sem isso, uma OS "urgente" esquecida nunca alcanca uma
// "critica" recem-criada e fica pra sempre no fim da fila.
const SLA_DAYS_BY_PRIORITY: Record<WorkOrderPriority, number> = {
  critical: 2,
  urgent: 7,
  attention: 30,
};

const ESCALATES_TO: Record<WorkOrderPriority, WorkOrderPriority> = {
  attention: "urgent",
  urgent: "critical",
  critical: "critical",
};

function effectivePriority(workOrder: DispatchWorkOrder, now: Date): WorkOrderPriority {
  const daysOpen = (now.getTime() - workOrder.createdAt.getTime()) / (24 * 60 * 60 * 1000);
  if (daysOpen > SLA_DAYS_BY_PRIORITY[workOrder.priority]) {
    return ESCALATES_TO[workOrder.priority];
  }
  return workOrder.priority;
}

const MAX_ROUTE_SPAN_KM = 30;

const EARTH_RADIUS_METERS = 6_371_000;

function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function buildGeographicBatches(
  workOrders: DispatchWorkOrder[],
  capacityPerDay: number,
  homeBase?: { lat: number; lon: number },
  now: Date = new Date(),
): DispatchWorkOrder[][] {
  const sorted = [...workOrders].sort((a, b) => {
    const priority =
      PRIORITY_WEIGHT[effectivePriority(a, now)] - PRIORITY_WEIGHT[effectivePriority(b, now)];
    if (priority !== 0) return priority;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const used = new Set<string>();
  const batches: DispatchWorkOrder[][] = [];

  for (const seed of sorted) {
    if (used.has(seed.id)) continue;

    const batch: DispatchWorkOrder[] = [seed];
    used.add(seed.id);

    let minKm = seed.kmStart;
    let maxKm = seed.kmEnd;

    for (const candidate of sorted) {
      if (used.has(candidate.id)) continue;
      if (batch.length >= capacityPerDay) break;

      const newMin = Math.min(minKm, candidate.kmStart);
      const newMax = Math.max(maxKm, candidate.kmEnd);

      if (newMax - newMin > MAX_ROUTE_SPAN_KM) continue;

      batch.push(candidate);
      used.add(candidate.id);
      minKm = newMin;
      maxKm = newMax;
    }

    batch.sort((a, b) => a.kmStart - b.kmStart);

    // Comeca a rota pela ponta mais perto da base do time, senao a equipe
    // as vezes teria que atravessar o proprio trecho do dia so pra chegar
    // no primeiro ponto (base pode estar mais perto do fim do lote que do
    // inicio, dado que os lotes nao sao necessariamente contiguos).
    if (homeBase && batch.length > 1) {
      const first = batch[0];
      const last = batch[batch.length - 1];
      if (distanceMeters(homeBase, last) < distanceMeters(homeBase, first)) {
        batch.reverse();
      }
    }

    batches.push(batch);
  }

  return batches;
}

export function findResponsibleTeam(
  workOrder: Pick<DispatchWorkOrder, "roadName" | "kmStart" | "kmEnd">,
  activeTeams: Team[],
): Team | undefined {
  return activeTeams.find(
    (team) =>
      team.roadName === workOrder.roadName &&
      workOrder.kmStart <= team.kmEnd &&
      workOrder.kmEnd >= team.kmStart,
  );
}

export function dateFromToday(dayOffset: number, today = new Date()): string {
  const date = new Date(today);
  date.setDate(date.getDate() + dayOffset);

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
