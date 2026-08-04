import { sql } from "drizzle-orm";
import { DrizzleService } from "../database/drizzle.service";
import { AlertsService } from "./alerts.service";
import {
  createTestDrizzle,
  describeDb,
  insertSegment,
  migrateTestDb,
  truncateAll,
} from "../test-db";

const SP = "aaaaaaaa-0000-4000-8000-000000000001";
const AMAZONAS = "aaaaaaaa-0000-4000-8000-000000000002";

describeDb("alerts against a real database", () => {
  let drizzle: DrizzleService;
  let alerts: AlertsService;

  beforeAll(async () => {
    drizzle = createTestDrizzle();
    await migrateTestDb(drizzle);
  }, 60_000);

  afterAll(async () => {
    await drizzle.onModuleDestroy();
  });

  beforeEach(async () => {
    await truncateAll(drizzle);
    alerts = new AlertsService(drizzle);

    await insertSegment(drizzle, { id: SP, roadName: "BR-101", kmStart: 10, kmEnd: 20 });
    await insertSegment(drizzle, { id: AMAZONAS, roadName: "BR-319", kmStart: 10, kmEnd: 20 });
  });

  describe("createOrFindOpen with the partial unique index", () => {
    it("cria o alerta na primeira chamada", async () => {
      const alert = await alerts.createOrFindOpen(SP, "urgent", 60);

      expect(alert.segmentId).toBe(SP);
      expect(alert.level).toBe("urgent");
      expect(alert.closedAt).toBeNull();
    });

    it("é idempotente: a segunda chamada devolve o mesmo alerta", async () => {
      const first = await alerts.createOrFindOpen(SP, "urgent", 60);
      const second = await alerts.createOrFindOpen(SP, "urgent", 75);

      expect(second.id).toBe(first.id);
      expect(second.score).toBe(60);

      const [{ total }] = await drizzle.db.execute<{ total: string }>(
        sql`SELECT COUNT(*) AS total FROM alerts`,
      );
      expect(Number(total)).toBe(1);
    });

    it("mantém alertas separados por nível no mesmo segmento", async () => {
      const urgent = await alerts.createOrFindOpen(SP, "urgent", 60);
      const critical = await alerts.createOrFindOpen(SP, "critical", 85);

      expect(critical.id).not.toBe(urgent.id);
    });

    it("permite reabrir depois que o alerta anterior foi fechado", async () => {
      const first = await alerts.createOrFindOpen(SP, "urgent", 60);
      await drizzle.db.execute(sql`UPDATE alerts SET closed_at = NOW() WHERE id = ${first.id}`);

      const reopened = await alerts.createOrFindOpen(SP, "urgent", 70);

      expect(reopened.id).not.toBe(first.id);
      expect(reopened.closedAt).toBeNull();
    });
  });

  describe("findAll scoped by territory", () => {
    beforeEach(async () => {
      await alerts.createOrFindOpen(SP, "urgent", 60);
      await alerts.createOrFindOpen(AMAZONAS, "critical", 90);
    });

    it("devolve tudo para manager", async () => {
      const result = await alerts.findAll();

      expect(result).toHaveLength(2);
    });

    it("devolve apenas alertas de segmentos dentro do território", async () => {
      const result = await alerts.findAll({ roadName: "BR-101", kmStart: 0, kmEnd: 50 });

      expect(result).toHaveLength(1);
      expect(result[0].segmentId).toBe(SP);
    });

    it("não vaza alertas de outra rodovia com a mesma faixa de km", async () => {
      const result = await alerts.findAll({ roadName: "BR-116", kmStart: 0, kmEnd: 50 });

      expect(result).toHaveLength(0);
    });

    it("exclui território que não sobrepõe a faixa do segmento", async () => {
      const result = await alerts.findAll({ roadName: "BR-101", kmStart: 100, kmEnd: 200 });

      expect(result).toHaveLength(0);
    });

    it("inclui segmento que apenas encosta na borda do território", async () => {
      const result = await alerts.findAll({ roadName: "BR-101", kmStart: 20, kmEnd: 30 });

      expect(result).toHaveLength(1);
    });
  });

  describe("updateOsId", () => {
    it("grava a OS no alerta", async () => {
      const alert = await alerts.createOrFindOpen(SP, "urgent", 60);
      const workOrderId = "bbbbbbbb-0000-4000-8000-000000000001";

      await alerts.updateOsId(alert.id, workOrderId);

      const [row] = await drizzle.db.execute<{ os_id: string }>(
        sql`SELECT os_id FROM alerts WHERE id = ${alert.id}`,
      );
      expect(row.os_id).toBe(workOrderId);
    });
  });
});

describeDb("alerts date mapping from raw SQL", () => {
  let drizzle: DrizzleService;
  let alerts: AlertsService;

  beforeAll(async () => {
    drizzle = createTestDrizzle();
    await migrateTestDb(drizzle);
  }, 60_000);

  afterAll(async () => {
    await drizzle.onModuleDestroy();
  });

  beforeEach(async () => {
    await truncateAll(drizzle);
    alerts = new AlertsService(drizzle);
    await insertSegment(drizzle, { id: SP, roadName: "BR-101", kmStart: 10, kmEnd: 20 });
  });

  it("devolve Date de verdade no insert cru, não string", async () => {
    const alert = await alerts.createOrFindOpen(SP, "urgent", 60);

    expect(alert.createdAt).toBeInstanceOf(Date);
    expect(Number.isNaN(alert.createdAt.getTime())).toBe(false);
  });

  it("devolve Date de verdade também no caminho do query builder", async () => {
    await alerts.createOrFindOpen(SP, "urgent", 60);

    const [found] = await alerts.findAll();

    expect(found.createdAt).toBeInstanceOf(Date);
  });
});
