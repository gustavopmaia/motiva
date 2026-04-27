import { Alert } from "@domain/entities/alert.entity";

export const ALERT_CREATED_EVENT = "alert.created";

export type AlertCreatedEvent = {
  alert: Alert;
};
