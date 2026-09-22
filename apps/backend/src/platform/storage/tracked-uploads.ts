import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { sql } from "drizzle-orm";
import { DrizzleService } from "../../database/drizzle.service";
import { Transaction } from "../persistence/transaction";
import { ObjectStorage, PhotoNamespace } from "./object-storage.port";

@Injectable()
export class TrackedUploads {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly storage: ObjectStorage,
  ) {}

  async put(namespace: PhotoNamespace, key: string, body: Buffer): Promise<void> {
    const hash = createHash("sha256").update(body).digest("hex");
    // Commit the intent first: a crash after PUT must still leave an inventory entry.
    await this.drizzle.db.execute(
      sql`INSERT INTO object_uploads (namespace, key, sha256, size_bytes) VALUES (${namespace}, ${key}, ${hash}, ${body.length})`,
    );
    await this.storage.put(namespace, key, body);
  }

  async attach(tx: Transaction, namespace: PhotoNamespace, key: string): Promise<void> {
    const rows =
      await tx.execute(sql`UPDATE object_uploads SET state = 'attached', attached_at = clock_timestamp()
      WHERE namespace = ${namespace} AND key = ${key} AND state = 'pending' RETURNING key`);
    if (rows.length !== 1)
      throw new Error("Upload is no longer available; retry with a new upload");
  }

  async cleanup(options: {
    apply: boolean;
    graceHours: number;
  }): Promise<Array<{ namespace: PhotoNamespace; key: string }>> {
    if (!Number.isFinite(options.graceHours) || options.graceHours < 24)
      throw new Error("Upload cleanup requires at least 24 hours of grace");
    const candidates = await this.drizzle.transaction(async (tx) => {
      const rows = await tx.execute<{ namespace: PhotoNamespace; key: string }>(sql`
        SELECT namespace, key FROM object_uploads u
        WHERE state IN ('pending', 'deleting') AND created_at < clock_timestamp() - ${options.graceHours} * interval '1 hour'
          AND NOT EXISTS (SELECT 1 FROM vehicle_captures c WHERE u.namespace = 'vehicle-captures' AND c.photo_path = u.key)
          AND NOT EXISTS (SELECT 1 FROM work_order_photos p WHERE u.namespace = 'work-order-photos' AND p.photo_path = u.key)
        ORDER BY created_at LIMIT 100 FOR UPDATE OF u SKIP LOCKED
      `);
      if (options.apply)
        for (const row of rows)
          await tx.execute(
            sql`UPDATE object_uploads SET state = 'deleting' WHERE namespace = ${row.namespace} AND key = ${row.key}`,
          );
      return rows;
    });
    if (options.apply)
      for (const row of candidates) {
        // No storage I/O while holding database locks. The deleting state fences attachment.
        await this.storage.delete(row.namespace, row.key);
        await this.drizzle.db.execute(
          sql`UPDATE object_uploads SET state = 'deleted', deleted_at = clock_timestamp() WHERE namespace = ${row.namespace} AND key = ${row.key} AND state = 'deleting'`,
        );
      }
    return [...candidates];
  }
}
