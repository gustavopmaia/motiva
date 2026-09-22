import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { DrizzleService } from "../../database/drizzle.service";
async function main(): Promise<void> {
  const db = new DrizzleService(new ConfigService(process.env));
  try {
    const id = process.argv[2];
    if (!id) {
      const rows = await db.db.execute(
        sql`SELECT id, queue, type, created_at, attempts, last_error FROM outbox_events WHERE completed_at IS NULL ORDER BY created_at LIMIT 100`,
      );
      process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
      return;
    }
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Expected event UUID");
    if (!process.argv.includes("--apply")) {
      process.stdout.write(`Dry run: would requeue ${id}\n`);
      return;
    }
    const actor = process.env.OPERATOR_ID;
    if (!actor) throw new Error("OPERATOR_ID is required for an audited replay");
    await db.transaction(async (tx) => {
      const [event] = await tx.execute(
        sql`UPDATE outbox_events SET attempts = 0, available_at = clock_timestamp(), last_error = NULL WHERE id = ${id} AND completed_at IS NULL RETURNING id`,
      );
      if (!event) throw new Error("Event does not exist or is already complete");
      await tx.execute(
        sql`INSERT INTO outbox_replay_audit (id, event_id, actor_id) VALUES (${randomUUID()}, ${id}, ${actor})`,
      );
    });
    process.stdout.write(`Requeued ${id}\n`);
  } finally {
    await db.onModuleDestroy();
  }
}
main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Replay failed"}\n`);
  process.exitCode = 1;
});
