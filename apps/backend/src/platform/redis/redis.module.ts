import { Global, Injectable, Logger, Module, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class ApplicationRedis implements OnModuleDestroy {
  readonly client: Redis;
  constructor(config: ConfigService) {
    const logger = new Logger(ApplicationRedis.name);
    this.client = new Redis(config.getOrThrow<string>("REDIS_URL"), {
      connectTimeout: 2000,
      commandTimeout: 2000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.client.on("error", () => logger.error({ action: "redis.connection_failed" }));
  }
  onModuleDestroy(): void {
    this.client.disconnect();
  }
}
@Global()
@Module({ providers: [ApplicationRedis], exports: [ApplicationRedis] })
export class ApplicationRedisModule {}
