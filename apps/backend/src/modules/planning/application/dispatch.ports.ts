import type { Team, DispatchWorkOrder } from "../domain/dispatch-policy";
export type PlanningSnapshot = {
  team: Team;
  teams: Team[];
  candidates: DispatchWorkOrder[];
  routes: Array<{ id: string; status: string; items: string[] }>;
  requestedVersion: string | null;
};
export interface DispatchRepository {
  teamIds(): Promise<string[]>;
  snapshot(teamId: string, onlyRequested: boolean): Promise<PlanningSnapshot | null>;
  apply(
    snapshot: PlanningSnapshot,
    batches: DispatchWorkOrder[][],
  ): Promise<"applied" | "stale" | "busy">;
}
