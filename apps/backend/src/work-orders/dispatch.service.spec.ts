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
  // lon usado como proxy linear de posicao (igual ao km) so pra testar
  // distancia da base sem precisar de coordenadas geograficas de verdade.
  lat: 0,
  lon: kmStart,
});

// fixa "now" em BASE_DATE por padrao — sem isso, o escalonamento por SLA
// (novo) compararia as datas fixas dos testes contra o relogio real, e o
// resultado mudaria sozinho conforme os dias passam.
const dispatch = (
  orders: DispatchWorkOrder[],
  capacityPerDay: number,
  homeBase?: { lat: number; lon: number },
  now: Date = BASE_DATE,
) => buildGeographicBatches(orders, capacityPerDay, homeBase, now);

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
    expect(dispatch([], 3)).toEqual([]);
  });

  it("respeita a capacidade diária, criando um lote por dia", () => {
    const orders = [wo("a", 0, 1), wo("b", 2, 3), wo("c", 4, 5), wo("d", 6, 7)];

    const batches = dispatch(orders, 2);

    expect(batches.map((b) => b.length)).toEqual([2, 2]);
  });

  it("ordena por prioridade antes da data de criação", () => {
    const older = new Date("2026-08-01T12:00:00");
    const orders = [
      wo("attention-antiga", 0, 1, "attention", older),
      wo("critical-nova", 50, 51, "critical"),
      wo("urgent-nova", 90, 91, "urgent"),
    ];

    const batches = dispatch(orders, 1);

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

    const batches = dispatch(orders, 1);

    expect(batches.map((b) => b[0].id)).toEqual(["antiga", "nova"]);
  });

  it("não agrupa ordens que ultrapassam o alcance de 30 km", () => {
    const batches = dispatch([wo("perto", 0, 1), wo("longe", 40, 41)], 5);

    expect(batches).toHaveLength(2);
    expect(batches[0].map((b) => b.id)).toEqual(["perto"]);
    expect(batches[1].map((b) => b.id)).toEqual(["longe"]);
  });

  it("agrupa ordens exatamente no limite de 30 km", () => {
    const batches = dispatch([wo("inicio", 0, 0), wo("limite", 30, 30)], 5);

    expect(batches).toHaveLength(1);
    expect(batches[0].map((b) => b.id)).toEqual(["inicio", "limite"]);
  });

  it("ordena cada lote por km para a equipe percorrer em sequência", () => {
    const orders = [wo("km20", 20, 21), wo("km5", 5, 6), wo("km12", 12, 13)];

    const [batch] = dispatch(orders, 3);

    expect(batch.map((b) => b.id)).toEqual(["km5", "km12", "km20"]);
  });

  it("nunca coloca a mesma ordem em dois lotes", () => {
    const orders = [wo("a", 0, 1), wo("b", 1, 2), wo("c", 80, 81), wo("d", 81, 82)];

    const batches = dispatch(orders, 2);
    const ids = batches.flat().map((b) => b.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("sem base informada, mantem ordem crescente de km (compatibilidade)", () => {
    const orders = [wo("km20", 20, 21), wo("km5", 5, 6)];

    const [batch] = dispatch(orders, 2);

    expect(batch.map((b) => b.id)).toEqual(["km5", "km20"]);
  });

  it("comeca a rota pela ponta mais perto da base do time", () => {
    const orders = [wo("km5", 5, 6), wo("km20", 20, 21)];

    const [batch] = dispatch(orders, 2, { lat: 0, lon: 25 });

    expect(batch.map((b) => b.id)).toEqual(["km20", "km5"]);
  });

  it("mantem ordem crescente quando a base ja esta perto do inicio", () => {
    const orders = [wo("km5", 5, 6), wo("km20", 20, 21)];

    const [batch] = dispatch(orders, 2, { lat: 0, lon: 0 });

    expect(batch.map((b) => b.id)).toEqual(["km5", "km20"]);
  });

  it("escala a prioridade quando estoura o prazo da propria prioridade", () => {
    // capacidade 1: cada OS vira um lote/dia proprio, entao a ordem dos
    // lotes revela a prioridade escolhida — dentro de um mesmo lote a
    // ordem final e sempre por km (pra rota fazer sentido), nao por
    // prioridade, entao isso teria que ser testado por dia, nao por item.
    const now = new Date("2026-08-20T00:00:00");
    const orders = [
      // 1 dia em aberto, dentro do prazo de 7 dias do urgente.
      wo("urgent-fresca", 20, 21, "urgent", new Date("2026-08-19T00:00:00")),
      // 41 dias em aberto, estourou o prazo de 30 dias da atencao -> vira
      // urgente tambem; empatada com a fresca, vence por ser mais antiga.
      wo("attention-vencida", 0, 1, "attention", new Date("2026-07-10T00:00:00")),
    ];

    const batches = dispatch(orders, 1, undefined, now);

    expect(batches.map((b) => b[0].id)).toEqual(["attention-vencida", "urgent-fresca"]);
  });

  it("nao escala quando ainda esta dentro do prazo da prioridade", () => {
    const now = new Date("2026-08-10T00:00:00");
    const orders = [
      wo("urgent-fresca", 20, 21, "urgent", new Date("2026-08-09T00:00:00")),
      // 5 dias em aberto, bem dentro dos 30 dias da atencao — nao escala,
      // continua atras da urgente.
      wo("attention-recente", 0, 1, "attention", new Date("2026-08-05T00:00:00")),
    ];

    const batches = dispatch(orders, 1, undefined, now);

    expect(batches.map((b) => b[0].id)).toEqual(["urgent-fresca", "attention-recente"]);
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
