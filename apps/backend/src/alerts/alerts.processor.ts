import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { SEGMENT_EVENTS_QUEUE, ProcessReadingResultJob } from "../common/queues";
import { RiskChangedHandler } from "../modules/maintenance/public";
import { parseRiskEvent } from "../platform/messaging/event-validation";

@Processor(SEGMENT_EVENTS_QUEUE)
export class AlertsProcessor extends WorkerHost {
  constructor(private readonly handler: RiskChangedHandler) {
    super();
  }
  async process(job: Job<ProcessReadingResultJob>): Promise<void> {
    await this.handler.execute(parseRiskEvent(job.data));
  }
}
