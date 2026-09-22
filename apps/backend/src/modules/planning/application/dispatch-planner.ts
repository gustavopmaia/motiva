import { buildGeographicBatches, findResponsibleTeam } from "../domain/dispatch-policy";
import type { DispatchRepository } from "./dispatch.ports";
export class DispatchPlanner {
  constructor(private readonly repository: DispatchRepository) {}
  async execute(onlyRequested = false): Promise<void> {
    for (const teamId of await this.repository.teamIds()) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const snapshot = await this.repository.snapshot(teamId, onlyRequested);
        if (!snapshot) break;
        const { team, teams, candidates } = snapshot;
        const assigned = candidates.filter(
          (order) => findResponsibleTeam(order, teams)?.id === team.id,
        );
        // No transaction or database locks while computing geographic batches.
        const batches = buildGeographicBatches(assigned, team.capacityPerDay, {
          lat: team.baseLat,
          lon: team.baseLng,
        });
        if ((await this.repository.apply(snapshot, batches)) !== "stale") break;
      }
    }
  }
}
