import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
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
  ) {}

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
    const [database, redis] = await Promise.all([
      reachable(() => this.drizzle.db.execute(sql`SELECT 1`)),
      reachable(async () => (await this.queue.client).ping()),
    ]);

    if (!database || !redis) {
      throw new ServiceUnavailableException({
        message: "Dependencies unavailable.",
        details: { database, redis },
      });
    }

    return { status: "ok" };
  }
}

async function reachable(probe: () => Promise<unknown>): Promise<boolean> {
  try {
    await probe();
    return true;
  } catch {
    return false;
  }
}
