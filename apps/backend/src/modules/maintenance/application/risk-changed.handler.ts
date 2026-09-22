import { riskLevel } from "../../monitoring/public";
import { MaintenanceRiskRepository, RiskChangedInput } from "./risk-changed.ports";

export class RiskChangedHandler {
  constructor(private readonly repository: MaintenanceRiskRepository) {}
  async execute(input: RiskChangedInput): Promise<void> {
    await this.repository.withEvent(input, async (context) => {
      // Legacy deliveries cannot identify their maintenance cycle after an intervention.
      if (input.interventionAt === undefined && context.lastInterventionAt !== null) return;
      if (input.interventionAt !== undefined && context.lastInterventionAt !== input.interventionAt)
        return;
      const level = riskLevel(context.score ?? 0);
      if (!level || level !== input.level) return;
      await context.ensureMaintenance(level, context.score!);
    });
  }
}
