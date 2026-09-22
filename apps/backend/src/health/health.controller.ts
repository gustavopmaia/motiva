import { PhotoStorage } from "../platform/storage/object-storage";
import { ClassifierClient } from "../vehicle-captures/classifier-client";
import { Controller, Get, Optional, ServiceUnavailableException } from "@nestjs/common";
import { ReadingsMqttHandler } from "../readings/readings-mqtt.handler";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
import { sql } from "drizzle-orm";
import { DrizzleService } from "../database/drizzle.service";
import { SEGMENT_EVENTS_QUEUE } from "../common/queues";

class HealthResponseDto {
  @ApiProperty({
    description: "Current health status for the backend process.",
    example: "ok",
  })
  status!: string;
}

@ApiTags("Health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly drizzle: DrizzleService,
    @InjectQueue(SEGMENT_EVENTS_QUEUE)
    private readonly queue: Queue,
    @Optional() private readonly mqtt?: ReadingsMqttHandler,
    @Optional() private readonly storage?: PhotoStorage,
    @Optional() private readonly classifier?: ClassifierClient,
  ) {}

  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  ready() {
    return this.check();
  }

  @Get()
  @ApiOperation({
    summary: "Check backend health",
    description:
      "Reports whether the process can reach Postgres and Redis. Used by the container healthcheck and uptime probes.",
  })
  @ApiOkResponse({
    type: HealthResponseDto,
    description: "Backend and its dependencies are reachable.",
  })
  @ApiServiceUnavailableResponse({ description: "Postgres or Redis is unreachable." })
  async check() {
    const [database, redis, storage, classifier] = await Promise.all([
      reachable(() => this.drizzle.db.execute(sql`SELECT 1`)),
      reachable(async () => (await this.queue.client).ping()),
      this.storage ? reachable(() => this.storage!.checkAvailability()) : true,
      this.checksClassifier() ? reachable(() => this.classifier!.checkAvailability()) : true,
    ]);

    const mqtt = this.mqtt?.isReady() ?? true;
    if (!database || !redis || !mqtt || !storage || !classifier) {
      throw new ServiceUnavailableException({
        message: "Dependencies unavailable.",
        details: {
          database,
          redis,
          ...(this.mqtt ? { mqtt } : {}),
          ...(this.storage ? { storage } : {}),
          ...(this.checksClassifier() ? { classifier } : {}),
        },
      });
    }

    return { status: "ok" };
  }

  // So o processo de imagens dedicado depende do classifier para trabalhar. Em
  // `all` o mesmo processo serve a API: classifier fora do ar nao pode derrubar
  // a readiness/liveness dele, os jobs de captura ja fazem retry.
  private checksClassifier(): boolean {
    return !!this.classifier && process.env.BACKEND_ROLE === "images";
  }
}

async function reachable(probe: () => Promise<unknown>): Promise<boolean> {
  try {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        probe(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Health probe timed out")), 2000);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    return true;
  } catch {
    return false;
  }
}
