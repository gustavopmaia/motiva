export type RiskChangedInput = {
  segmentId: string;
  score: number;
  level: "attention" | "urgent" | "critical";
  readingId: string;
  eventId?: string;
  interventionAt?: string | null;
};
export type MaintenanceRiskContext = {
  score: number | null;
  lastInterventionAt: string | null;
  ensureMaintenance(level: RiskChangedInput["level"], score: number): Promise<void>;
};
export abstract class MaintenanceRiskRepository {
  abstract withEvent(
    input: RiskChangedInput,
    action: (context: MaintenanceRiskContext) => Promise<void>,
  ): Promise<void>;
}
