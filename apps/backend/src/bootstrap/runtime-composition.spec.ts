import "reflect-metadata";
import { MODULE_METADATA } from "@nestjs/common/constants";
const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});
function composition(role: string) {
  process.env.BACKEND_ROLE = role;
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:55432/motiva_test";
  process.env.REDIS_URL = "redis://localhost:56379";
  process.env.JWT_SECRET = "composition-test-secret-only";
  process.env.STORAGE_DRIVER = "local";
  process.env.MQTT_URL = "mqtt://localhost:51883";
  const names = new Set<string>();
  jest.isolateModules(() => {
    const { AppModule } = jest.requireActual("../app.module");
    const visited = new Set<unknown>();
    const visit = (definition: any) => {
      if (!definition || visited.has(definition)) return;
      visited.add(definition);
      const module = definition.module ?? definition;
      if (typeof module !== "function") return;
      names.add(module.name);
      for (const provider of [
        ...(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, module) ?? []),
        ...(definition.providers ?? []),
      ]) {
        names.add((provider.provide ?? provider).name ?? String(provider.provide ?? provider));
      }
      for (const controller of Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module) ?? [])
        names.add(controller.name);
      for (const dependency of [
        ...(Reflect.getMetadata(MODULE_METADATA.IMPORTS, module) ?? []),
        ...(definition.imports ?? []),
      ])
        visit(dependency);
    };
    visit(AppModule);
  });
  return names;
}
it("keeps queue consumers, MQTT and schedulers out of API replicas", () => {
  const names = composition("api");
  expect(names.has("WorkOrdersController")).toBe(true);
  for (const name of [
    "AlertsProcessor",
    "WorkOrdersProcessor",
    "VehicleCapturesProcessor",
    "ReadingsMqttHandler",
    "DispatchCronService",
    "OutboxPublisher",
  ])
    expect(names.has(name)).toBe(false);
});
it("runs domain workers without HTTP business controllers, authentication or photo storage", () => {
  const names = composition("domain");
  for (const name of ["AlertsProcessor", "DispatchCronService", "OutboxPublisher"])
    expect(names.has(name)).toBe(true);
  for (const name of [
    "AuthModule",
    "StorageModule",
    "WorkOrdersController",
    "ReadingsMqttHandler",
    "VehicleCapturesProcessor",
  ])
    expect(names.has(name)).toBe(false);
});
it("isolates image workers from domain consumers", () => {
  const names = composition("images");
  expect(names.has("VehicleCapturesProcessor")).toBe(true);
  expect(names.has("StorageModule")).toBe(true);
  for (const name of [
    "AuthModule",
    "AlertsProcessor",
    "DispatchCronService",
    "ReadingsMqttHandler",
  ])
    expect(names.has(name)).toBe(false);
});
it("runs ingestion without background classification or HTTP business controllers", () => {
  const names = composition("mqtt");
  expect(names.has("ReadingsMqttHandler")).toBe(true);
  for (const name of [
    "AuthModule",
    "StorageModule",
    "OutboxPublisher",
    "ReadingsController",
    "AlertsProcessor",
  ])
    expect(names.has(name)).toBe(false);
});
