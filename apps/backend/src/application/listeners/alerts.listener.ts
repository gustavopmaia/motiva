import { Injectable } from "@nestjs/common";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { randomUUID } from "crypto";
import { Alert, AlertLevel } from "@domain/entities/alert.entity";
import { AlertRepository } from "@domain/repositories/alert.repository";
import { SCORE_UPDATED_EVENT, ScoreUpdatedEvent } from "@application/events/readings.events";
import { ALERT_CREATED_EVENT } from "@application/events/alerts.events";

function scoreToLevel(score: number): AlertLevel | null {
  if (score >= 80) return "critical";
  if (score >= 55) return "urgent";
  if (score >= 30) return "attention";
  return null;
}

@Injectable()
export class AlertsListener {
  constructor(
    private readonly alertRepository: AlertRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent(SCORE_UPDATED_EVENT)
  async onScoreUpdated(event: ScoreUpdatedEvent) {
    const level = scoreToLevel(event.currentScore);
    if (!level) return;

    const existing = await this.alertRepository.findOpenBySegmentAndLevel(event.segmentId, level);
    if (existing) return;

    const alert = new Alert(randomUUID(), event.segmentId, null, level, event.currentScore, {});

    const saved = await this.alertRepository.save(alert);
    this.eventEmitter.emit(ALERT_CREATED_EVENT, { alert: saved });
  }
}
