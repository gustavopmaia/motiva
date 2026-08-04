import { TeamsService } from "./teams.service";
import { JwtPayload } from "../auth/jwt-payload";

const teamRow = {
  id: "t-1",
  name: "North maintenance crew",
  roadName: "BR-101",
  kmStart: "10.000",
  kmEnd: "42.500",
};

const makeService = (rows: unknown[] = [teamRow]) => {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const innerJoin = jest.fn().mockReturnValue({ where });
  const from = jest.fn().mockReturnValue({ innerJoin });
  const select = jest.fn().mockReturnValue({ from });

  return { service: new TeamsService({ db: { select } } as never), select };
};

const user = (role: JwtPayload["role"]): JwtPayload => ({
  sub: "u-1",
  email: "u@motiva.com",
  role,
});

describe("TeamsService.scopeFor", () => {
  it("dá escopo total para manager sem consultar times", async () => {
    const { service, select } = makeService();

    await expect(service.scopeFor(user("manager"))).resolves.toEqual({ kind: "all" });
    expect(select).not.toHaveBeenCalled();
  });

  it("restringe field ao território do seu time", async () => {
    const { service } = makeService();

    const scope = await service.scopeFor(user("field"));

    expect(scope).toEqual({
      kind: "team",
      team: {
        id: "t-1",
        name: "North maintenance crew",
        roadName: "BR-101",
        kmStart: 10,
        kmEnd: 42.5,
      },
    });
  });

  it("não devolve nada para field sem time", async () => {
    const { service } = makeService([]);

    await expect(service.scopeFor(user("field"))).resolves.toEqual({ kind: "none" });
  });
});

describe("TeamsService.findByUserId", () => {
  it("converte km de string numeric para number", async () => {
    const { service } = makeService();

    const team = await service.findByUserId("u-1");

    expect(team?.kmStart).toBe(10);
    expect(team?.kmEnd).toBe(42.5);
  });

  it("retorna null quando o usuário não pertence a time algum", async () => {
    const { service } = makeService([]);

    await expect(service.findByUserId("u-1")).resolves.toBeNull();
  });
});
