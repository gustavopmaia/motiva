import { Alert, AlertLevel } from "@domain/entities/alert.entity";

export const AlertRepository = Symbol("AlertRepository");

export interface AlertRepository {
  save(alert: Alert): Promise<Alert>;
  findOpenBySegmentAndLevel(segmentId: string, level: AlertLevel): Promise<Alert | null>;
  findAll(): Promise<Alert[]>;
}
