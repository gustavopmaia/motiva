import { ThrottlerStorage } from "@nestjs/throttler";
import { ThrottlerStorageRecord } from "@nestjs/throttler/dist/throttler-storage-record.interface";
import Redis from "ioredis";
import { createHash } from "crypto";

// Counter, expiry and blocking must be one operation across API replicas.
const INCREMENT = `
local blocked = redis.call('PTTL', KEYS[2])
if blocked > 0 then return {tonumber(ARGV[2]) + 1, blocked, 1, blocked} end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local remaining = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return {hits, remaining, 1, tonumber(ARGV[3])}
end
return {hits, remaining, 0, 0}
`;

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Pick<Redis, "eval">) {}
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const identity = createHash("sha256").update(`${throttlerName}:${key}`).digest("hex");
    // Hash tag keeps both keys in the same slot if Redis Cluster is used.
    const hitKey = `throttle:{${identity}}`;
    const [totalHits, remaining, blocked, blockedFor] = (await this.redis.eval(
      INCREMENT,
      2,
      hitKey,
      `${hitKey}:blocked`,
      ttl,
      limit,
      blockDuration > 0 ? blockDuration : ttl,
    )) as number[];
    return {
      totalHits,
      timeToExpire: Math.ceil(Math.max(0, remaining) / 1000),
      isBlocked: blocked === 1,
      timeToBlockExpire: Math.ceil(Math.max(0, blockedFor) / 1000),
    };
  }
}
