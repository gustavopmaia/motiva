import { measured } from "../telemetry/operations";
import { Global, Injectable, Module, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  HeadBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile, rm } from "fs/promises";
import { join } from "path";
import { DatabaseModule } from "../../database/database.module";

import { ObjectStorage, PhotoNamespace } from "./object-storage.port";
import { TrackedUploads } from "./tracked-uploads";
export { ObjectStorage, PhotoNamespace } from "./object-storage.port";
function validateKey(key: string): void {
  if (!/^[a-zA-Z0-9_-]+\.jpg$/.test(key)) throw new Error("Invalid object key");
}
@Injectable()
export class PhotoStorage extends ObjectStorage implements OnModuleDestroy {
  private readonly client?: S3Client;
  constructor(private readonly config: ConfigService) {
    super();
    if (this.config.get<string>("STORAGE_DRIVER") === "s3") {
      this.client = new S3Client({
        endpoint: this.config.get<string>("S3_ENDPOINT"),
        region: this.config.get<string>("S3_REGION") ?? "us-east-1",
        forcePathStyle: this.config.get<string>("S3_FORCE_PATH_STYLE") === "true",
        maxAttempts: 3,
      });
    }
  }
  put(namespace: PhotoNamespace, key: string, body: Buffer): Promise<void> {
    return measured("storage.put", () => this.putObject(namespace, key, body));
  }
  private async putObject(namespace: PhotoNamespace, key: string, body: Buffer): Promise<void> {
    validateKey(key);
    if (this.client) {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.getOrThrow<string>("S3_BUCKET"),
          Key: `${namespace}/${key}`,
          Body: body,
          ContentType: "image/jpeg",
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      return;
    }
    const directory = this.directory(namespace);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, key), body);
  }
  get(namespace: PhotoNamespace, key: string): Promise<Buffer> {
    return measured("storage.get", () => this.getObject(namespace, key));
  }
  private async getObject(namespace: PhotoNamespace, key: string): Promise<Buffer> {
    validateKey(key);
    if (this.client) {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.getOrThrow<string>("S3_BUCKET"),
          Key: `${namespace}/${key}`,
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      if (!result.Body) throw new Error("Missing object body");
      return Buffer.from(await result.Body.transformToByteArray());
    }
    return readFile(join(this.directory(namespace), key));
  }
  async checkAvailability(): Promise<void> {
    if (this.client)
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.config.getOrThrow<string>("S3_BUCKET") }),
        { abortSignal: AbortSignal.timeout(2000) },
      );
  }
  onModuleDestroy(): void {
    this.client?.destroy();
  }
  delete(namespace: PhotoNamespace, key: string): Promise<void> {
    return measured("storage.delete", () => this.deleteObject(namespace, key));
  }
  private async deleteObject(namespace: PhotoNamespace, key: string): Promise<void> {
    validateKey(key);
    if (this.client) {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.config.getOrThrow<string>("S3_BUCKET"),
          Key: `${namespace}/${key}`,
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
    } else await rm(join(this.directory(namespace), key), { force: true });
  }
  private directory(namespace: PhotoNamespace): string {
    return (
      this.config.get<string>(
        namespace === "vehicle-captures" ? "VEHICLE_CAPTURES_DIR" : "WORK_ORDER_PHOTOS_DIR",
      ) ?? `/data/${namespace}`
    );
  }
}
@Global()
@Module({
  imports: [DatabaseModule],
  providers: [PhotoStorage, { provide: ObjectStorage, useExisting: PhotoStorage }, TrackedUploads],
  exports: [ObjectStorage, PhotoStorage, TrackedUploads],
})
export class StorageModule {}
