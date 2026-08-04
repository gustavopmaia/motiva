import {
  buildGeographicBatches,
  dateFromToday,
  DispatchWorkOrder,
  findResponsibleTeam,
} from "./dispatch.service";
import { Team } from "../teams/team.entity";
import { WorkOrderPriority } from "./work-order.entity";

const BASE_DATE = new Date("2026-08-04T12:00:00");

const wo = (
  id: string,
  kmStart: number,
  kmEnd: number,
  priority: WorkOrderPriority = "attention",
  createdAt = BASE_DATE,
): DispatchWorkOrder => ({
  id,
  segmentId: `seg-${id}`,
  roadName: "BR-101",
  priority,
  createdAt,
  kmStart,
  kmEnd,
});

const team = (overrides: Partial<Team> = {}): Team => ({
  id: "t-1",
  name: "North crew",
  baseLat: 0,
  baseLng: 0,
  roadName: "BR-101",
  kmStart: 0,
  kmEnd: 100,
  capacityPerDay: 3,
  active: true,
  ...overrides,
});

describe("buildGeographicBatches", () => {
  it("não cria lote algum sem ordens de serviço", () => {
    expect(buildGeographicBatches([], 3)).toEqual([]);
  });

  it("respeita a capacidade diária, criando um lote por dia", () => {
    const orders = [wo("a", 0, 1), wo("b", 2, 3), wo("c", 4, 5), wo("d", 6, 7)];

    const batches = buildGeographicBatches(orders, 2);

    expect(batches.map((b) => b.length)).toEqual([2, 2]);
  });

  it("ordena por prioridade antes da data de criação", () => {
    const older = new Date("2026-08-01T12:00:00");
    const orders = [
      wo("attention-antiga", 0, 1, "attention", older),
      wo("critical-nova", 50, 51, "critical"),
      wo("urgent-nova", 90, 91, "urgent"),
    ];

    const batches = buildGeographicBatches(orders, 1);

    expect(batches.map((b) => b[0].id)).toEqual([
      "critical-nova",
      "urgent-nova",
      "attention-antiga",
    ]);
  });

  it("desempata por data de criação dentro da mesma prioridade", () => {
    const orders = [
      wo("nova", 0, 1, "urgent", new Date("2026-08-03T12:00:00")),
      wo("antiga", 60, 61, "urgent", new Date("2026-08-01T12:00:00")),
    ];

    const batches = buildGeographicBatches(orders, 1);

    expect(batches.map((b) => b[0].id)).toEqual(["antiga", "nova"]);
  });

  it("não agrupa ordens que ultrapassam o alcance de 30 km", () => {
    const batches = buildGeographicBatches([wo("perto", 0, 1), wo("longe", 40, 41)], 5);

    expect(batches).toHaveLength(2);
    expect(batches[0].map((b) => b.id)).toEqual(["perto"]);
    expect(batches[1].map((b) => b.id)).toEqual(["longe"]);
  });

  it("agrupa ordens exatamente no limite de 30 km", () => {
    const batches = buildGeographicBatches([wo("inicio", 0, 0), wo("limite", 30, 30)], 5);

    expect(batches).toHaveLength(1);
    expect(batches[0].map((b) => b.id)).toEqual(["inicio", "limite"]);
  });

  it("ordena cada lote por km para a equipe percorrer em sequência", () => {
    const orders = [wo("km20", 20, 21), wo("km5", 5, 6), wo("km12", 12, 13)];

    const [batch] = buildGeographicBatches(orders, 3);

    expect(batch.map((b) => b.id)).toEqual(["km5", "km12", "km20"]);
  });

  it("nunca coloca a mesma ordem em dois lotes", () => {
    const orders = [wo("a", 0, 1), wo("b", 1, 2), wo("c", 80, 81), wo("d", 81, 82)];

    const batches = buildGeographicBatches(orders, 2);
    const ids = batches.flat().map((b) => b.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("findResponsibleTeam", () => {
  it("encontra o time cujo trecho sobrepõe a ordem", () => {
    const teams = [
      team({ id: "sul", kmStart: 0, kmEnd: 50 }),
      team({ id: "norte", kmStart: 50, kmEnd: 100 }),
    ];

    expect(findResponsibleTeam(wo("a", 60, 70), teams)?.id).toBe("norte");
  });

  it("ignora times de outra rodovia", () => {
    const teams = [team({ roadName: "BR-116" })];

    expect(findResponsibleTeam(wo("a", 10, 20), teams)).toBeUndefined();
  });

  it("não cobre ordem fora do trecho de todos os times", () => {
    const teams = [team({ kmStart: 0, kmEnd: 10 })];

    expect(findResponsibleTeam(wo("a", 50, 60), teams)).toBeUndefined();
  });

  it("aceita sobreposição apenas na borda do trecho", () => {
    const teams = [team({ kmStart: 0, kmEnd: 10 })];

    expect(findResponsibleTeam(wo("a", 10, 20), teams)?.id).toBe("t-1");
  });
});

describe("dateFromToday", () => {
  it("usa o dia local, não o UTC", () => {
    const lateEvening = new Date(2026, 7, 4, 21, 30);

    expect(dateFromToday(0, lateEvening)).toBe("2026-08-04");
  });

  it("avança um dia por offset", () => {
    expect(dateFromToday(1, new Date(2026, 7, 4, 9, 0))).toBe("2026-08-05");
    expect(dateFromToday(2, new Date(2026, 7, 4, 9, 0))).toBe("2026-08-06");
  });

  it("vira o mês corretamente", () => {
    expect(dateFromToday(1, new Date(2026, 7, 31, 9, 0))).toBe("2026-09-01");
  });

  it("não altera a data recebida", () => {
    const today = new Date(2026, 7, 4, 9, 0);

    dateFromToday(5, today);

    expect(today.getDate()).toBe(4);
  });
});
