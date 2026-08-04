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
import { ALERT_EVENTS_QUEUE, SEGMENT_EVENTS_QUEUE } from "../common/queues";

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
  ) {}

  @Get()
  @ApiExcludeEndpoint()
  @Header("Content-Type", register.contentType)
  async scrape(): Promise<string> {
    for (const queue of [this.segments, this.alerts]) {
      const counts = await queue.getJobCounts("waiting", "active", "failed", "delayed");
      for (const [state, value] of Object.entries(counts)) {
        queueDepth.set({ queue: queue.name, state }, value);
      }
    }

    return register.metrics();
  }
}
