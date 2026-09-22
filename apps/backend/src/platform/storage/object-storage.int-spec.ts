import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { PhotoStorage } from "./object-storage";
const endpoint = process.env.TEST_S3_ENDPOINT;
const suite = endpoint ? describe : describe.skip;
suite("shared photo storage", () => {
  const bucket = `motiva-test-${randomUUID()}`;
  const key = `${randomUUID()}.jpg`;
  let client: S3Client;
  let a: PhotoStorage;
  let b: PhotoStorage;
  beforeAll(async () => {
    client = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true });
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    const config = new ConfigService({
      STORAGE_DRIVER: "s3",
      S3_ENDPOINT: endpoint,
      S3_REGION: "us-east-1",
      S3_FORCE_PATH_STYLE: "true",
      S3_BUCKET: bucket,
    });
    a = new PhotoStorage(config);
    b = new PhotoStorage(config);
  }, 60000);
  afterAll(async () => {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: `vehicle-captures/${key}` }));
    await client.send(new DeleteBucketCommand({ Bucket: bucket }));
    a?.onModuleDestroy();
    b?.onModuleDestroy();
    client.destroy();
  });
  it("allows a different instance to read an uploaded capture", async () => {
    await expect(a.checkAvailability()).resolves.toBeUndefined();
    const photo = Buffer.from([255, 216, 255, 217]);
    await a.put("vehicle-captures", key, photo);
    expect(await b.get("vehicle-captures", key)).toEqual(photo);
  });
  it("fails readiness for an unavailable bucket", async () => {
    const missing = new PhotoStorage(
      new ConfigService({
        STORAGE_DRIVER: "s3",
        S3_ENDPOINT: endpoint,
        S3_REGION: "us-east-1",
        S3_FORCE_PATH_STYLE: "true",
        S3_BUCKET: `absent-${randomUUID()}`,
      }),
    );
    try {
      await expect(missing.checkAvailability()).rejects.toThrow();
    } finally {
      missing.onModuleDestroy();
    }
  });
});
