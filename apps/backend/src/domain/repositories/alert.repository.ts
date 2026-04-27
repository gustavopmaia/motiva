import { Alert, AlertLevel } from "@domain/entities/alert.entity";

export abstract class AlertRepository {
  abstract save(alert: Alert): Promise<Alert>;
  abstract findOpenBySegmentAndLevel(segmentId: string, level: AlertLevel): Promise<Alert | null>;
  abstract findAll(): Promise<Alert[]>;
}
