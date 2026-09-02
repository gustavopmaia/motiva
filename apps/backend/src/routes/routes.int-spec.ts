import { sql } from "drizzle-orm";
import { DrizzleService } from "../database/drizzle.service";
import { RoutesService } from "./routes.service";
import { DispatchService } from "../work-orders/dispatch.service";
import { InvalidOperationError, NotFoundError } from "../common/errors";
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

const SEGMENT_A = "cccccccc-0000-4000-8000-00000000010a";
const SEGMENT_B = "cccccccc-0000-4000-8000-00000000010b";
const TEAM_NORTE = "dddddddd-0000-4000-8000-00000000010a";
const ALERT_A = "eeeeeeee-0000-4000-8000-00000000010a";
const ALERT_B = "eeeeeeee-0000-4000-8000-00000000010b";
const WO_A = "ffffffff-0000-4000-8000-00000000010a";
const WO_B = "ffffffff-0000-4000-8000-00000000010b";
const ALERT_C = "eeeeeeee-0000-4000-8000-00000000010c";
const WO_C = "ffffffff-0000-4000-8000-00000000010c";

describeDb("routes against a real database", () => {
  let drizzle: DrizzleService;
  let routes: RoutesService;
  let dispatch: DispatchService;

  beforeAll(async () => {
    drizzle = createTestDrizzle();
    await migrateTestDb(drizzle);
  }, 60_000);

  afterAll(async () => {
    await drizzle.onModuleDestroy();
  });

  beforeEach(async () => {
    await truncateAll(drizzle);
    routes = new RoutesService(drizzle);
    dispatch = new DispatchService(drizzle);

    await insertSegment(drizzle, {
      id: SEGMENT_A,
      roadName: "BR-101",
      kmStart: 10,
      kmEnd: 11,
      lat: -23.4162,
      lon: -46.7841,
    });
    await insertSegment(drizzle, {
      id: SEGMENT_B,
      roadName: "BR-101",
      kmStart: 12,
      kmEnd: 13,
      lat: -23.42,
      lon: -46.79,
    });
    await insertTeam(drizzle, {
      id: TEAM_NORTE,
      name: "Equipe Norte",
      roadName: "BR-101",
      kmStart: 0,
      kmEnd: 100,
      // perto do segmento A (km 10): a rota deve comecar por ele, nao pelo
      // km 12 — sem coordenada explicita, tanto o time quanto um segmento
      // sem lat/lon cairiam no default (0,0) e colidiriam por coincidencia.
      baseLat: -23.415,
      baseLng: -46.783,
      capacityPerDay: 5,
    });
    await insertAlert(drizzle, { id: ALERT_A, segmentId: SEGMENT_A, level: "urgent" });
    await insertAlert(drizzle, { id: ALERT_B, segmentId: SEGMENT_B, level: "critical" });
    await insertWorkOrder(drizzle, { id: WO_A, segmentId: SEGMENT_A, alertId: ALERT_A });
    await insertWorkOrder(drizzle, { id: WO_B, segmentId: SEGMENT_B, alertId: ALERT_B });

    await dispatch.runDispatch();
  });

  async function teamOf(workOrderId: string): Promise<string | null> {
    const [row] = await drizzle.db.execute<{ team: string | null }>(
      sql`SELECT team FROM work_orders WHERE id = ${workOrderId}`,
    );
    return row.team;
  }

  async function criarRotaVazia(): Promise<string> {
    const id = "aaaaaaaa-0000-4000-8000-00000000020a";
    await drizzle.db.execute(sql`
      INSERT INTO routes (id, team_id, date, status)
      VALUES (${id}, ${TEAM_NORTE}, '2026-08-07', 'locked')
    `);
    return id;
  }

  it("lista a rota planejada com as OS na ordem de visita", async () => {
    const [route] = await routes.findAll({});

    expect(route.teamName).toBe("Equipe Norte");
    expect(route.status).toBe("pending_approval");
    expect(route.items.map((item) => item.orderIndex)).toEqual([0, 1]);
    expect(route.items.map((item) => item.kmStart)).toEqual([10, 12]);
    expect(route.items[0].roadName).toBe("BR-101");
  });

  it("devolve a coordenada real do trecho em cada parada", async () => {
    const [route] = await routes.findAll({});

    expect(route.items[0].lat).toBeCloseTo(-23.4162, 4);
    expect(route.items[0].lon).toBeCloseTo(-46.7841, 4);
  });

  it("filtra rotas por equipe", async () => {
    expect(await routes.findAll({ teamId: TEAM_NORTE })).toHaveLength(1);
    expect(await routes.findAll({ teamId: SEGMENT_A })).toHaveLength(0);
  });

  it("reordena as OS, trava a rota e a ordem sobrevive ao replan", async () => {
    const [planned] = await routes.findAll({});
    const invertida = [...planned.items].reverse().map((item) => item.workOrderId);

    const reordered = await routes.setItems(planned.id, invertida);

    expect(reordered.status).toBe("locked");
    expect(reordered.items.map((item) => item.workOrderId)).toEqual(invertida);

    await dispatch.runDispatch();

    const [depois] = await routes.findAll({});
    expect(depois.id).toBe(planned.id);
    expect(depois.status).toBe("locked");
    expect(depois.items.map((item) => item.workOrderId)).toEqual(invertida);
  });

  it("mantém a equipe das OS de uma rota travada após o replan", async () => {
    const [planned] = await routes.findAll({});
    await routes.updateStatus(planned.id, "locked");

    await dispatch.runDispatch();

    const rows = await drizzle.db.execute<{ team: string | null }>(
      sql`SELECT team FROM work_orders ORDER BY id`,
    );
    expect(rows.map((row) => row.team)).toEqual(["Equipe Norte", "Equipe Norte"]);
  });

  it("libera a rota travada de volta para o planejamento automático", async () => {
    const [planned] = await routes.findAll({});
    await routes.setItems(
      planned.id,
      [...planned.items].reverse().map((i) => i.workOrderId),
    );
    await routes.updateStatus(planned.id, "pending_approval");

    await dispatch.runDispatch();

    const [replanejada] = await routes.findAll({});
    expect(replanejada.id).not.toBe(planned.id);
    expect(replanejada.items.map((item) => item.kmStart)).toEqual([10, 12]);
  });

  it("adiciona uma OS solta na rota e assume a equipe", async () => {
    const [planned] = await routes.findAll({});
    await insertAlert(drizzle, { id: ALERT_C, segmentId: SEGMENT_B, level: "urgent" });
    await insertWorkOrder(drizzle, { id: WO_C, segmentId: SEGMENT_B, alertId: ALERT_C });

    const atualizada = await routes.setItems(planned.id, [WO_A, WO_C, WO_B]);

    expect(atualizada.items.map((item) => item.workOrderId)).toEqual([WO_A, WO_C, WO_B]);
    expect(atualizada.items.map((item) => item.orderIndex)).toEqual([0, 1, 2]);
    expect(await teamOf(WO_C)).toBe("Equipe Norte");
  });

  it("remove uma OS da rota e solta a equipe dela", async () => {
    const [planned] = await routes.findAll({});

    const atualizada = await routes.setItems(planned.id, [WO_B]);

    expect(atualizada.items.map((item) => item.workOrderId)).toEqual([WO_B]);
    expect(await teamOf(WO_A)).toBeNull();

    await dispatch.runDispatch();
    const rotas = await routes.findAll({});
    const roteadas = rotas.flatMap((route) => route.items.map((item) => item.workOrderId));
    expect(roteadas).toContain(WO_A);
  });

  it("esvazia a rota quando a lista vem vazia", async () => {
    const [planned] = await routes.findAll({});

    const vazia = await routes.setItems(planned.id, []);

    expect(vazia.items).toEqual([]);
    expect(vazia.status).toBe("locked");
    expect(await teamOf(WO_A)).toBeNull();
  });

  it("recusa OS duplicada, concluída, inexistente ou já roteada", async () => {
    const [planned] = await routes.findAll({});
    const inexistente = "ffffffff-0000-4000-8000-0000000001ff";

    await expect(routes.setItems(planned.id, [WO_A, WO_A])).rejects.toBeInstanceOf(
      InvalidOperationError,
    );
    await expect(routes.setItems(planned.id, [WO_A, inexistente])).rejects.toBeInstanceOf(
      NotFoundError,
    );

    await insertAlert(drizzle, { id: ALERT_C, segmentId: SEGMENT_B, level: "urgent" });
    await insertWorkOrder(drizzle, {
      id: WO_C,
      segmentId: SEGMENT_B,
      alertId: ALERT_C,
      status: "completed",
    });
    await expect(routes.setItems(planned.id, [WO_A, WO_C])).rejects.toBeInstanceOf(
      InvalidOperationError,
    );

    await routes.setItems(planned.id, [WO_A, WO_B]);
    const outra = await criarRotaVazia();
    await expect(routes.setItems(outra, [WO_B])).rejects.toBeInstanceOf(InvalidOperationError);
  });

  it("falha quando a rota não existe", async () => {
    const inexistente = "aaaaaaaa-0000-4000-8000-0000000001ff";

    await expect(routes.findById(inexistente)).resolves.toBeNull();
    await expect(routes.updateStatus(inexistente, "locked")).rejects.toBeInstanceOf(NotFoundError);
    await expect(routes.setItems(inexistente, [WO_A])).rejects.toBeInstanceOf(NotFoundError);
  });
});
