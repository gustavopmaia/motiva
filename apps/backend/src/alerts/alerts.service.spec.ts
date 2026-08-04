import { SQL, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { AlertsService } from "./alerts.service";

const dialect = new PgDialect();

const makeService = () => {
  let where: SQL | undefined;
  const orderBy = jest.fn().mockResolvedValue([]);
  const whereFn = jest.fn().mockImplementation((fragment?: SQL) => {
    where = fragment;
    return { orderBy };
  });
  const select = jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({ where: whereFn }),
  });

  return {
    service: new AlertsService({ db: { select } } as never),
    compiled: () => (where ? dialect.sqlToQuery(sql`SELECT 1 FROM alerts WHERE ${where}`) : null),
  };
};

describe("AlertsService.findAll", () => {
  it("não filtra nada para manager", async () => {
    const { service, compiled } = makeService();

    await service.findAll();

    expect(compiled()).toBeNull();
  });

  it("restringe ao território correlacionando o segmento do alerta", async () => {
    const { service, compiled } = makeService();

    await service.findAll({ roadName: "BR-101", kmStart: 10, kmEnd: 42.5 });

    const query = compiled();
    expect(query?.sql).toContain("EXISTS");
    expect(query?.sql).toContain('"alerts"."segment_id"');
    expect(query?.sql).toContain("rs.road_name = $1");
    expect(query?.params).toEqual(["BR-101", 42.5, 10]);
  });
});
