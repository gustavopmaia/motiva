import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { Transaction } from "../../../platform/persistence/transaction";
export async function recordMaintenanceAction(
  tx: Transaction,
  actor: string,
  action: string,
  workOrderId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await tx.execute(
    sql`INSERT INTO maintenance_audit (id, actor_id, action, work_order_id, details) VALUES (${randomUUID()}, ${actor}, ${action}, ${workOrderId}, ${JSON.stringify(details)}::jsonb)`,
  );
}
