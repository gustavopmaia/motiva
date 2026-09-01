import { ReportRow, ReportsService } from "./reports.service";

const fakeConfig = { get: () => undefined } as never;
const fakeDrizzle = {} as never;

function makeRow(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    roadName: "SP-021",
    direction: "norte",
    kmStart: "12.000",
    kmEnd: "14.500",
    location: "faixa_1",
    team: "Equipe Norte",
    completedAt: new Date("2026-08-05T14:32:00Z"),
    photoPath: "abc.jpg",
    photoHash: "deadbeef",
    photoValidationStatus: "verified",
    ...overrides,
  };
}

describe("ReportsService.renderCsv", () => {
  const service = new ReportsService(fakeDrizzle, fakeConfig);

  it("inclui cabecalho com pista, local e hash", () => {
    const csv = service.renderCsv([makeRow()]);
    const [header] = csv.split("\n");

    expect(header).toBe(
      "Rodovia,Pista,Km Inicio,Km Fim,Local,Equipe,Concluido em,Evidencia,Hash da Foto",
    );
  });

  it("preenche pista/local reais e status legivel numa linha completa", () => {
    const csv = service.renderCsv([makeRow()]);
    const [, dataLine] = csv.split("\n");

    expect(dataLine).toBe(
      "SP-021,Norte,12.000,14.500,Faixa 1,Equipe Norte,2026-08-05 14:32,Confirmada,deadbeef",
    );
  });

  it("mostra - quando pista/local sao null (OS sem essa granularidade)", () => {
    const csv = service.renderCsv([
      makeRow({ direction: null, location: null, photoValidationStatus: null, photoHash: null }),
    ]);
    const [, dataLine] = csv.split("\n");

    expect(dataLine).toBe("SP-021,-,12.000,14.500,-,Equipe Norte,2026-08-05 14:32,Sem foto,-");
  });
});
