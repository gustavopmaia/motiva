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
    await insertWorkOrder(drizzle, { id: WO_A, segmentId: SEGMENT_A, alertId: ALERT_A });
    await insertWorkOrder(drizzle, { id: WO_B, segmentId: SEGMENT_B, alertId: ALERT_B });

    await dispatch.runDispatch();
  });

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

    // Valores distintos entre si: uma troca de lat com lon quebra o teste.
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

    const reordered = await routes.reorder(planned.id, invertida);

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
    await routes.reorder(
      planned.id,
      [...planned.items].reverse().map((i) => i.workOrderId),
    );
    await routes.updateStatus(planned.id, "pending_approval");

    await dispatch.runDispatch();

    const [replanejada] = await routes.findAll({});
    expect(replanejada.id).not.toBe(planned.id);
    expect(replanejada.items.map((item) => item.kmStart)).toEqual([10, 12]);
  });

  it("recusa reordenar com um conjunto de OS diferente", async () => {
    const [planned] = await routes.findAll({});

    await expect(routes.reorder(planned.id, [WO_A])).rejects.toBeInstanceOf(InvalidOperationError);
    await expect(routes.reorder(planned.id, [WO_A, WO_A])).rejects.toBeInstanceOf(
      InvalidOperationError,
    );
    await expect(routes.reorder(planned.id, [WO_A, WO_B, WO_B])).rejects.toBeInstanceOf(
      InvalidOperationError,
    );
  });

  it("falha quando a rota não existe", async () => {
    const inexistente = "aaaaaaaa-0000-4000-8000-0000000001ff";

    await expect(routes.findById(inexistente)).resolves.toBeNull();
    await expect(routes.updateStatus(inexistente, "locked")).rejects.toBeInstanceOf(NotFoundError);
    await expect(routes.reorder(inexistente, [WO_A])).rejects.toBeInstanceOf(NotFoundError);
  });
});
