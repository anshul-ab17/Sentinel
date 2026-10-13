import { createClient } from "redis";
import type { PoolClient } from "pg";

import type { Database } from "../../../packages/database/store.ts";

const outboxChannel = "sentinel:outbox";
const cacheIndex = "sentinel:cache:keys";
const cacheTtlSeconds = 3;
const rateLimitScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return {count, redis.call('TTL', KEYS[1])}
`;
const invalidateCacheScript = `
local keys = redis.call('SMEMBERS', KEYS[1])
for _, key in ipairs(keys) do redis.call('UNLINK', key) end
redis.call('DEL', KEYS[1])
return #keys
`;

export function createRedisInfrastructure(url: string, db: Database) {
  const client = createClient({ url });
  const subscriber = client.duplicate();
  const listeners = new Set<(id: string) => void>();
  let postgresListener: PoolClient | undefined;

  client.on("error", (error) => console.error("Redis client error", error.message));
  subscriber.on("error", (error) => console.error("Redis subscriber error", error.message));

  return {
    async connect() {
      try {
        await Promise.all([client.connect(), subscriber.connect()]);
        await subscriber.subscribe(outboxChannel, (id) => {
          const wakeStreams = () => {
            for (const listener of listeners) listener(id);
          };
          void client
            .eval(invalidateCacheScript, { keys: [cacheIndex], arguments: [] })
            .then(wakeStreams, wakeStreams);
        });

        const listener = await db.connect();
        postgresListener = listener;
        listener.on("notification", (notification) => {
          if (notification.channel !== "sentinel_outbox" || !notification.payload) return;
          void client.publish(outboxChannel, notification.payload).catch((error: unknown) => {
            console.error("Redis outbox publish failed", error);
          });
        });
        await listener.query("LISTEN sentinel_outbox");
      } catch (error) {
        await this.close();
        throw error;
      }
    },
    async close() {
      if (postgresListener) {
        await postgresListener.query("UNLISTEN sentinel_outbox").catch(() => undefined);
        postgresListener.release();
      }
      await Promise.allSettled(
        [subscriber, client]
          .filter((connection) => connection.isOpen)
          .map((connection) => connection.quit()),
      );
    },
    async checkRateLimit(key: string, limit: number, windowSeconds: number) {
      const result = (await client.eval(rateLimitScript, {
        keys: [`sentinel:rate:${key}`],
        arguments: [String(windowSeconds)],
      })) as [number, number];
      return { allowed: result[0] <= limit, retryAfter: Math.max(1, result[1]) };
    },
    async getCached(key: string) {
      return client.get(`sentinel:cache:${key}`);
    },
    async setCached(key: string, value: string) {
      const cacheKey = `sentinel:cache:${key}`;
      await client
        .multi()
        .set(cacheKey, value, { EX: cacheTtlSeconds })
        .sAdd(cacheIndex, cacheKey)
        .expire(cacheIndex, cacheTtlSeconds)
        .exec();
    },
    onOutbox(listener: (id: string) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async ping() {
      return client.ping();
    },
  };
}

export type RedisInfrastructure = ReturnType<typeof createRedisInfrastructure>;
