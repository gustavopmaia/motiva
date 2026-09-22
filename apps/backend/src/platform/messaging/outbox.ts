import { operationContext } from "../context/operation-context";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { Transaction } from "../persistence/transaction";

export async function appendEvent(
  tx: Transaction,
  queue: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const id = randomUUID();
  payload = { ...operationContext.getStore(), ...payload };
  await tx.execute(
    sql`INSERT INTO outbox_events (id, queue, type, payload) VALUES (${id}, ${queue}, ${type}, ${JSON.stringify(payload)}::jsonb)`,
  );
  return id;
}

/** The event row is both durable delivery intent and single-consumer inbox. */
export async function consumeEvent(
  tx: Transaction,
  eventId: string | undefined,
  effect: () => Promise<void>,
): Promise<void> {
  let correlationId: string | undefined;
  if (eventId) {
    const [event] = await tx.execute<{
      completed_at: Date | null;
      payload: { correlationId?: string };
    }>(sql`SELECT completed_at, payload FROM outbox_events WHERE id = ${eventId} FOR UPDATE`);
    if (!event || event.completed_at) return;
    correlationId = event.payload.correlationId ?? eventId;
  }
  if (correlationId) await operationContext.run({ correlationId, causationId: eventId }, effect);
  else await effect();
  if (eventId)
    await tx.execute(
      sql`UPDATE outbox_events SET completed_at = clock_timestamp(), last_error = NULL WHERE id = ${eventId}`,
    );
}
