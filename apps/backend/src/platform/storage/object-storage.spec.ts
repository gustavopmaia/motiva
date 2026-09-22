import { ConfigService } from "@nestjs/config";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { PhotoStorage } from "./object-storage";
it("rejects traversal even in the development adapter", async () => {
  const storage = new PhotoStorage(new ConfigService({ STORAGE_DRIVER: "local" }));
  await expect(storage.get("vehicle-captures", "../../credentials.jpg")).rejects.toThrow(
    "Invalid object key",
  );
});
it("preserves bytes between independent development storage instances", async () => {
  const directory = await mkdtemp(join(tmpdir(), "motiva-storage-"));
  try {
    const config = new ConfigService({ STORAGE_DRIVER: "local", VEHICLE_CAPTURES_DIR: directory });
    const a = new PhotoStorage(config),
      b = new PhotoStorage(config);
    await a.put("vehicle-captures", "photo.jpg", Buffer.from("example"));
    expect((await b.get("vehicle-captures", "photo.jpg")).toString()).toBe("example");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
