import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import { sql } from "drizzle-orm";
import { DrizzleService } from "../../database/drizzle.service";
import { PhotoNamespace, PhotoStorage } from "../storage/object-storage";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (apply && (!process.env.S3_BUCKET || process.env.STORAGE_DRIVER !== "s3"))
    throw new Error("--apply requires STORAGE_DRIVER=s3 and S3_BUCKET");
  const db = new DrizzleService(new ConfigService(process.env));
  const local = new PhotoStorage(new ConfigService({ ...process.env, STORAGE_DRIVER: "local" }));
  const remote = new PhotoStorage(new ConfigService({ ...process.env, STORAGE_DRIVER: "s3" }));
  try {
    for (const [table, namespace] of [
      ["vehicle_captures", "vehicle-captures"],
      ["work_order_photos", "work-order-photos"],
    ] as const) {
      let after = "00000000-0000-0000-0000-000000000000";
      while (true) {
        const rows = await db.db.execute<{ id: string; photo_path: string }>(
          sql`SELECT id, photo_path FROM ${sql.identifier(table)} WHERE id > ${after} ORDER BY id LIMIT 100`,
        );
        if (!rows.length) break;
        for (const row of rows) {
          if (apply) {
            const source = await local.get(namespace as PhotoNamespace, row.photo_path);
            await remote.put(namespace, row.photo_path, source);
            const copied = await remote.get(namespace, row.photo_path);
            if (digest(source) !== digest(copied))
              throw new Error(`Checksum mismatch for ${row.id}`);
            process.stdout.write(
              JSON.stringify({ namespace, id: row.id, sha256: digest(source), verified: true }) +
                "\n",
            );
          } else
            process.stdout.write(
              JSON.stringify({ namespace, id: row.id, key: row.photo_path, dryRun: true }) + "\n",
            );
        }
        after = rows[rows.length - 1].id;
      }
    }
  } finally {
    local.onModuleDestroy();
    remote.onModuleDestroy();
    await db.onModuleDestroy();
  }
}
function digest(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Photo migration failed"}\n`);
  process.exitCode = 1;
});
