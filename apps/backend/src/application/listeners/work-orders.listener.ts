import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { AlertLevel } from "@domain/entities/alert.entity";
import { WorkOrderPriority } from "@domain/entities/work-order.entity";
import { CreateWorkOrderUseCase } from "@application/use-cases/create-work-order.use-case";
import { ALERT_CREATED_EVENT, AlertCreatedEvent } from "@application/events/alerts.events";

const LEVEL_TO_PRIORITY: Record<AlertLevel, WorkOrderPriority> = {
  attention: "normal",
  urgent: "urgent",
  critical: "critical",
};

@Injectable()
export class WorkOrdersListener {
  constructor(private readonly createWorkOrder: CreateWorkOrderUseCase) {}

  @OnEvent(ALERT_CREATED_EVENT)
  async onAlertCreated(event: AlertCreatedEvent) {
    const { alert } = event;
    await this.createWorkOrder.execute({
      segmentId: alert.segmentId,
      alertId: alert.id,
      priority: LEVEL_TO_PRIORITY[alert.level],
      scoreAtCreation: alert.score,
    });
  }
}
