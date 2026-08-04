import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { territoryOverlap } from "./territory";

const dialect = new PgDialect();
const territory = { roadName: "BR-101", kmStart: 10, kmEnd: 42.5 };

const compile = (fragment: ReturnType<typeof territoryOverlap>) =>
  dialect.sqlToQuery(sql`SELECT 1 FROM road_segments WHERE ${fragment}`);

describe("territoryOverlap", () => {
  it("compara a rodovia e o intervalo de km com parâmetros vinculados", () => {
    const query = compile(territoryOverlap(territory));

    expect(query.sql).toContain("road_segments.road_name = $1");
    expect(query.sql).toContain("CAST(road_segments.km_start AS FLOAT) <= $2");
    expect(query.sql).toContain("CAST(road_segments.km_end AS FLOAT) >= $3");
    expect(query.params).toEqual(["BR-101", 42.5, 10]);
    expect(query.sql).not.toContain("BR-101");
  });

  it("aceita alias de tabela para consultas com JOIN", () => {
    const query = compile(territoryOverlap(territory, "rs"));

    expect(query.sql).toContain("rs.road_name = $1");
    expect(query.sql).toContain("CAST(rs.km_start AS FLOAT) <= $2");
    expect(query.sql).toContain("CAST(rs.km_end AS FLOAT) >= $3");
  });

  it("sobrepõe quando o trecho encosta na borda do território", () => {
    const query = compile(territoryOverlap(territory));

    expect(query.sql).toContain("<=");
    expect(query.sql).toContain(">=");
  });
});
