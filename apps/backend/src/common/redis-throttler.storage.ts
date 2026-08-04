import { ThrottlerStorage } from "@nestjs/throttler";
import { ThrottlerStorageRecord } from "@nestjs/throttler/dist/throttler-storage-record.interface";
import { Queue } from "bullmq";

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly queue: Queue) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redis = await this.queue.client;
    const hitKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `${hitKey}:blocked`;

    const blockedFor = await redis.pttl(blockKey);
    if (blockedFor > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: Math.ceil(blockedFor / 1000),
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockedFor / 1000),
      };
    }

    const totalHits = await redis.incr(hitKey);
    if (totalHits === 1) await redis.pexpire(hitKey, ttl);

    const remaining = await redis.pttl(hitKey);
    const timeToExpire = Math.ceil((remaining > 0 ? remaining : ttl) / 1000);

    if (totalHits > limit) {
      await redis.set(blockKey, "1", "PX", blockDuration > 0 ? blockDuration : ttl);
      const blockMs = blockDuration > 0 ? blockDuration : ttl;
      return {
        totalHits,
        timeToExpire,
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockMs / 1000),
      };
    }

    return { totalHits, timeToExpire, isBlocked: false, timeToBlockExpire: 0 };
  }
}
