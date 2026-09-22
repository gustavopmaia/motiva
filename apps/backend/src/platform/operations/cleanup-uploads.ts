import { ConfigService } from "@nestjs/config";
import { DrizzleService } from "../../database/drizzle.service";
import { PhotoStorage } from "../storage/object-storage";
import { TrackedUploads } from "../storage/tracked-uploads";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (apply && !process.env.OPERATOR_ID) throw new Error("OPERATOR_ID is required for --apply");
  if (process.env.NODE_ENV === "production" && process.env.STORAGE_DRIVER !== "s3")
    throw new Error("Production cleanup requires STORAGE_DRIVER=s3");
  const config = new ConfigService(process.env);
  const db = new DrizzleService(config);
  const storage = new PhotoStorage(config);
  try {
    const rows = await new TrackedUploads(db, storage).cleanup({
      apply,
      graceHours: Number(process.env.UPLOAD_CLEANUP_GRACE_HOURS ?? 24),
    });
    for (const row of rows)
      process.stdout.write(
        JSON.stringify({
          ...row,
          dryRun: !apply,
          operator: process.env.OPERATOR_ID ?? null,
          at: new Date().toISOString(),
        }) + "\n",
      );
  } finally {
    storage.onModuleDestroy();
    await db.onModuleDestroy();
  }
}
main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Upload cleanup failed"}\n`);
  process.exitCode = 1;
});
