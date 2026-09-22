export type PhotoNamespace = "vehicle-captures" | "work-order-photos";
export abstract class ObjectStorage {
  abstract put(namespace: PhotoNamespace, key: string, body: Buffer): Promise<void>;
  abstract get(namespace: PhotoNamespace, key: string): Promise<Buffer>;
  abstract delete(namespace: PhotoNamespace, key: string): Promise<void>;
}
