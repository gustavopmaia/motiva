import { sql } from "drizzle-orm";
import { DrizzleService } from "../database/drizzle.service";
import { DispatchService } from "./dispatch.service";
import { WorkOrdersService } from "./work-orders.service";
import {
  createTestDrizzle,
  describeDb,
  insertAlert,
  insertSegment,
  insertTeam,
  insertWorkOrder,
  migrateTestDb,
  truncateAll,
} from "../test-db";

const SEGMENT_A = "cccccccc-0000-4000-8000-00000000000a";
const SEGMENT_B = "cccccccc-0000-4000-8000-00000000000b";
const TEAM_NORTE = "dddddddd-0000-4000-8000-00000000000a";
const ALERT_A = "eeeeeeee-0000-4000-8000-00000000000a";
const ALERT_B = "eeeeeeee-0000-4000-8000-00000000000b";
const WO_A = "ffffffff-0000-4000-8000-00000000000a";
const WO_B = "ffffffff-0000-4000-8000-00000000000b";

describeDb("dispatch against a real database", () => {
  let drizzle: DrizzleService;
  let dispatch: DispatchService;

  const countRoutes = async () => {
    const [row] = await drizzle.db.execute<{ total: string }>(
      sql`SELECT COUNT(*) AS total FROM routes`,
    );
    return Number(row.total);
  };

  const teamOf = async (workOrderId: string) => {
    const [row] = await drizzle.db.execute<{ team: string | null }>(
      sql`SELECT team FROM work_orders WHERE id = ${workOrderId}`,
    );
    return row.team;
  };

  beforeAll(async () => {
    drizzle = createTestDrizzle();
    await migrateTestDb(drizzle);
  }, 60_000);

  afterAll(async () => {
    await drizzle.onModuleDestroy();
  });

  beforeEach(async () => {
    await truncateAll(drizzle);
    dispatch = new DispatchService(drizzle);

    await insertSegment(drizzle, { id: SEGMENT_A, roadName: "BR-101", kmStart: 10, kmEnd: 11 });
    await insertSegment(drizzle, { id: SEGMENT_B, roadName: "BR-101", kmStart: 12, kmEnd: 13 });
    await insertTeam(drizzle, {
      id: TEAM_NORTE,
      name: "Equipe Norte",
      roadName: "BR-101",
      kmStart: 0,
      kmEnd: 100,
      capacityPerDay: 5,
    });
    await insertAlert(drizzle, { id: ALERT_A, segmentId: SEGMENT_A, level: "urgent" });
    await insertAlert(drizzle, { id: ALERT_B, segmentId: SEGMENT_B, level: "critical" });
  });

  it("cria rota e atribui as OS abertas à equipe responsável", async () => {
    await insertWorkOrder(drizzle, { id: WO_A, segmentId: SEGMENT_A, alertId: ALERT_A });
    await insertWorkOrder(drizzle, { id: WO_B, segmentId: SEGMENT_B, alertId: ALERT_B });

    await dispatch.runDispatch();

    expect(await countRoutes()).toBe(1);
    expect(await teamOf(WO_A)).toBe("Equipe Norte");
    expect(await teamOf(WO_B)).toBe("Equipe Norte");
  });

  it("não atribui OS fora do trecho de qualquer equipe", async () => {
    const distante = "cccccccc-0000-4000-8000-00000000000f";
    const alerta = "eeeeeeee-0000-4000-8000-00000000000f";
    const os = "ffffffff-0000-4000-8000-00000000000f";
    await insertSegment(drizzle, { id: distante, roadName: "BR-319", kmStart: 5, kmEnd: 6 });
    await insertAlert(drizzle, { id: alerta, segmentId: distante, level: "urgent" });
    await insertWorkOrder(drizzle, { id: os, segmentId: distante, alertId: alerta });

    await dispatch.runDispatch();

    expect(await teamOf(os)).toBeNull();
  });

  it("pula equipe que tem OS em andamento, preservando a rota atual", async () => {
    await insertWorkOrder(drizzle, {
      id: WO_A,
      segmentId: SEGMENT_A,
      alertId: ALERT_A,
      status: "in_progress",
      team: "Equipe Norte",
    });
    await insertWorkOrder(drizzle, { id: WO_B, segmentId: SEGMENT_B, alertId: ALERT_B });

    await dispatch.runDispatch();

    expect(await countRoutes()).toBe(0);
    expect(await teamOf(WO_B)).toBeNull();
  });

  describe("clearOpenRoutes", () => {
    const criarRota = async (routeId: string, status: string, workOrderId: string) => {
      await drizzle.db.execute(sql`
        INSERT INTO routes (id, team_id, date, status)
        VALUES (${routeId}, ${TEAM_NORTE}, CURRENT_DATE, ${status})
      `);
      await drizzle.db.execute(sql`
        INSERT INTO route_items (id, route_id, work_order_id, order_index)
        VALUES (gen_random_uuid(), ${routeId}, ${workOrderId}, 0)
      `);
      await drizzle.db.execute(
        sql`UPDATE work_orders SET team = 'Equipe Norte' WHERE id = ${workOrderId}`,
      );
    };

    it("preserva rota travada e a OS que está dentro dela", async () => {
      await insertWorkOrder(drizzle, { id: WO_A, segmentId: SEGMENT_A, alertId: ALERT_A });
      await criarRota("11111111-0000-4000-8000-000000000001", "locked", WO_A);

      await dispatch.runDispatch();

      const [row] = await drizzle.db.execute<{ status: string }>(
        sql`SELECT status FROM routes WHERE id = '11111111-0000-4000-8000-000000000001'`,
      );
      expect(row.status).toBe("locked");
      expect(await teamOf(WO_A)).toBe("Equipe Norte");
    });

    it("apaga rota não travada e libera a OS para replanejamento", async () => {
      await insertWorkOrder(drizzle, { id: WO_A, segmentId: SEGMENT_A, alertId: ALERT_A });
      await criarRota("22222222-0000-4000-8000-000000000002", "pending_approval", WO_A);

      await dispatch.runDispatch();

      const [{ total }] = await drizzle.db.execute<{ total: string }>(
        sql`SELECT COUNT(*) AS total FROM routes WHERE id = '22222222-0000-4000-8000-000000000002'`,
      );
      expect(Number(total)).toBe(0);
      expect(await teamOf(WO_A)).toBe("Equipe Norte");
    });

    it("não redistribui OS que já está em rota travada", async () => {
      await insertWorkOrder(drizzle, { id: WO_A, segmentId: SEGMENT_A, alertId: ALERT_A });
      await criarRota("33333333-0000-4000-8000-000000000003", "locked", WO_A);

      await dispatch.runDispatch();

      const [{ total }] = await drizzle.db.execute<{ total: string }>(sql`
        SELECT COUNT(*) AS total FROM route_items WHERE work_order_id = ${WO_A}
      `);
      expect(Number(total)).toBe(1);
    });
  });

  describe("WorkOrdersService.complete in a transaction", () => {
    it("conclui as OS irmãs, zera o score e fecha os alertas do segmento", async () => {
      const irma = "ffffffff-0000-4000-8000-0000000000cc";
      const alertaIrma = "eeeeeeee-0000-4000-8000-0000000000cc";
      await insertWorkOrder(drizzle, { id: WO_A, segmentId: SEGMENT_A, alertId: ALERT_A });
      await insertAlert(drizzle, {
        id: alertaIrma,
        segmentId: SEGMENT_A,
        level: "attention",
      });
      await insertWorkOrder(drizzle, {
        id: irma,
        segmentId: SEGMENT_A,
        alertId: alertaIrma,
      });
      await drizzle.db.execute(
        sql`UPDATE road_segments SET score_current = 85, score_divergent = true WHERE id = ${SEGMENT_A}`,
      );

      const workOrders = new WorkOrdersService(drizzle, { markNeedsReplan: jest.fn() } as never);
      await workOrders.complete(WO_A);

      const [segment] = await drizzle.db.execute<{
        score_current: number;
        score_divergent: boolean;
      }>(sql`SELECT score_current, score_divergent FROM road_segments WHERE id = ${SEGMENT_A}`);
      expect(segment.score_current).toBe(0);
      expect(segment.score_divergent).toBe(false);

      const [abertos] = await drizzle.db.execute<{ total: string }>(sql`
        SELECT COUNT(*) AS total FROM alerts WHERE segment_id = ${SEGMENT_A} AND closed_at IS NULL
      `);
      expect(Number(abertos.total)).toBe(0);

      const [pendentes] = await drizzle.db.execute<{ total: string }>(sql`
        SELECT COUNT(*) AS total FROM work_orders
        WHERE segment_id = ${SEGMENT_A} AND status <> 'completed'
      `);
      expect(Number(pendentes.total)).toBe(0);
    });

    it("não toca em OS de outro segmento", async () => {
      await insertWorkOrder(drizzle, { id: WO_A, segmentId: SEGMENT_A, alertId: ALERT_A });
      await insertWorkOrder(drizzle, { id: WO_B, segmentId: SEGMENT_B, alertId: ALERT_B });

      const workOrders = new WorkOrdersService(drizzle, { markNeedsReplan: jest.fn() } as never);
      await workOrders.complete(WO_A);

      const [row] = await drizzle.db.execute<{ status: string }>(
        sql`SELECT status FROM work_orders WHERE id = ${WO_B}`,
      );
      expect(row.status).toBe("open");
    });
  });
});

describeDb("dispatch date mapping from raw SQL", () => {
  let drizzle: DrizzleService;

  beforeAll(async () => {
    drizzle = createTestDrizzle();
    await migrateTestDb(drizzle);
  }, 60_000);

  afterAll(async () => {
    await drizzle.onModuleDestroy();
  });

  it("ordena por createdAt sem estourar com string vinda do driver", async () => {
    await truncateAll(drizzle);
    await insertSegment(drizzle, { id: SEGMENT_A, roadName: "BR-101", kmStart: 10, kmEnd: 11 });
    await insertTeam(drizzle, {
      id: TEAM_NORTE,
      name: "Equipe Norte",
      roadName: "BR-101",
      kmStart: 0,
      kmEnd: 100,
    });
    await insertAlert(drizzle, { id: ALERT_A, segmentId: SEGMENT_A, level: "urgent" });
    await insertWorkOrder(drizzle, { id: WO_A, segmentId: SEGMENT_A, alertId: ALERT_A });

    await expect(new DispatchService(drizzle).runDispatch()).resolves.toBeUndefined();
  });
});
