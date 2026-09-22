import {
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  Header,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { ApiExcludeEndpoint } from "@nestjs/swagger";
import { Queue } from "bullmq";
import { collectDefaultMetrics, Counter, Gauge, Histogram, register } from "prom-client";
import { Observable } from "rxjs";
import { DrizzleService } from "../database/drizzle.service";
import { sql } from "drizzle-orm";
import {
  ALERT_EVENTS_QUEUE,
  SEGMENT_EVENTS_QUEUE,
  PHOTO_CLASSIFICATION_QUEUE,
} from "../common/queues";

collectDefaultMetrics();

const requests = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
});

const duration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.3, 1, 3, 10],
});

const queueDepth = new Gauge({
  name: "queue_jobs",
  help: "Jobs per queue by state",
  labelNames: ["queue", "state"],
});

const pendingEvents = new Gauge({
  name: "outbox_pending_events",
  help: "Durable events awaiting effects",
  labelNames: ["queue", "state"],
});
const oldestEvent = new Gauge({
  name: "outbox_oldest_pending_seconds",
  help: "Age of oldest pending durable event",
});
const pendingPlans = new Gauge({
  name: "dispatch_pending_teams",
  help: "Teams with durable replanning requests",
});

const expiredRisk = new Gauge({
  name: "risk_expired_segments",
  help: "Segments waiting for risk expiration processing",
});
const staleUploads = new Gauge({
  name: "storage_orphan_candidates",
  help: "Pending or deleting uploads older than the minimum 24 hour grace",
});

type HttpRequest = { method: string; route?: { path?: string } };
type HttpResponse = { statusCode: number; on(event: string, listener: () => void): void };

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    const response = http.getResponse<HttpResponse>();
    const stop = duration.startTimer();

    response.on("finish", () => {
      const labels = {
        method: request.method,
        route: request.route?.path ?? "unknown",
        status: String(response.statusCode),
      };
      requests.inc(labels);
      stop(labels);
    });

    return next.handle();
  }
}

@Controller("metrics")
export class MetricsController {
  constructor(
    @InjectQueue(SEGMENT_EVENTS_QUEUE) private readonly segments: Queue,
    @InjectQueue(ALERT_EVENTS_QUEUE) private readonly alerts: Queue,
    @InjectQueue(PHOTO_CLASSIFICATION_QUEUE) private readonly photos: Queue,
    private readonly drizzle: DrizzleService,
  ) {}

  @Get()
  @ApiExcludeEndpoint()
  @Header("Content-Type", register.contentType)
  async scrape(): Promise<string> {
    for (const queue of [this.segments, this.alerts, this.photos]) {
      const counts = await queue.getJobCounts("waiting", "active", "failed", "delayed");
      for (const [state, value] of Object.entries(counts)) {
        queueDepth.set({ queue: queue.name, state }, value);
      }
    }

    pendingEvents.reset();
    const events = await this.drizzle.db.execute<{ queue: string; state: string; count: number }>(
      sql`SELECT queue, CASE WHEN attempts >= 20 THEN 'exhausted' ELSE 'pending' END AS state, count(*)::int AS count FROM outbox_events WHERE completed_at IS NULL GROUP BY queue, state`,
    );
    for (const event of events)
      pendingEvents.set({ queue: event.queue, state: event.state }, event.count);
    const [age] = await this.drizzle.db.execute<{ seconds: number }>(
      sql`SELECT COALESCE(EXTRACT(epoch FROM clock_timestamp() - min(created_at)), 0)::float AS seconds FROM outbox_events WHERE completed_at IS NULL`,
    );
    oldestEvent.set(age.seconds);
    const [plans] = await this.drizzle.db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM dispatch_requests WHERE requested_version > completed_version`,
    );
    pendingPlans.set(plans.count);
    const [expired] = await this.drizzle.db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM road_segments WHERE risk_valid_until <= clock_timestamp()`,
    );
    expiredRisk.set(expired.count);
    const [uploads] = await this.drizzle.db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM object_uploads WHERE state IN ('pending', 'deleting') AND created_at < clock_timestamp() - interval '24 hours'`,
    );
    staleUploads.set(uploads.count);
    return register.metrics();
  }
}
