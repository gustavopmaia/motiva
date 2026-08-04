import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt.guard";
import { RolesGuard } from "./roles.guard";
import { ApiKeyGuard } from "./api-key.guard";

const contextFor = (request: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

const validPayload = { sub: "u-1", email: "u@motiva.com", role: "manager" };

describe("JwtAuthGuard", () => {
  const guardWith = (verify: jest.Mock) => new JwtAuthGuard({ verify } as never);

  it("recusa requisição sem header Authorization", () => {
    const guard = guardWith(jest.fn());

    expect(() => guard.canActivate(contextFor({ headers: {} }))).toThrow(UnauthorizedException);
  });

  it("recusa esquema diferente de Bearer", () => {
    const guard = guardWith(jest.fn());
    const context = contextFor({ headers: { authorization: "Basic abc" } });

    expect(() => guard.canActivate(context)).toThrow("Missing or invalid authorization header");
  });

  it("recusa token que falha na verificação", () => {
    const guard = guardWith(
      jest.fn().mockImplementation(() => {
        throw new Error("jwt expired");
      }),
    );
    const context = contextFor({ headers: { authorization: "Bearer abc" } });

    expect(() => guard.canActivate(context)).toThrow("Invalid or expired token");
  });

  it("recusa token assinado com role desconhecido", () => {
    const guard = guardWith(jest.fn().mockReturnValue({ ...validPayload, role: "admin" }));
    const request = { headers: { authorization: "Bearer abc" } };

    expect(() => guard.canActivate(contextFor(request))).toThrow("Invalid or expired token");
  });

  it("recusa token sem as claims esperadas", () => {
    const guard = guardWith(jest.fn().mockReturnValue({ role: "manager" }));
    const request = { headers: { authorization: "Bearer abc" } };

    expect(() => guard.canActivate(contextFor(request))).toThrow(UnauthorizedException);
  });

  it("anexa o payload à requisição quando o token é válido", () => {
    const guard = guardWith(jest.fn().mockReturnValue(validPayload));
    const request: { headers: Record<string, string>; user?: unknown } = {
      headers: { authorization: "Bearer abc" },
    };

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request.user).toEqual(validPayload);
  });
});

describe("RolesGuard", () => {
  const guardWith = (roles: unknown) => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(roles),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  };

  it("libera rota sem roles declarados", () => {
    expect(guardWith(undefined).canActivate(contextFor({}))).toBe(true);
    expect(guardWith([]).canActivate(contextFor({}))).toBe(true);
  });

  it("libera quando o role do usuário está na lista", () => {
    const context = contextFor({ user: validPayload });

    expect(guardWith(["manager"]).canActivate(context)).toBe(true);
  });

  it("bloqueia quando o role não está na lista", () => {
    const context = contextFor({ user: { ...validPayload, role: "field" } });

    expect(guardWith(["manager"]).canActivate(context)).toBe(false);
  });

  it("bloqueia quando não há usuário na requisição", () => {
    expect(guardWith(["manager"]).canActivate(contextFor({}))).toBe(false);
  });
});

describe("ApiKeyGuard", () => {
  const guardWith = (verifyApiKey: jest.Mock) => new ApiKeyGuard({ verifyApiKey } as never);

  it("recusa requisição sem o header x-api-key", async () => {
    const guard = guardWith(jest.fn());

    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toThrow("Missing API key");
  });

  it("recusa chave desconhecida", async () => {
    const guard = guardWith(jest.fn().mockResolvedValue(null));
    const context = contextFor({ headers: { "x-api-key": "chave-errada" } });

    await expect(guard.canActivate(context)).rejects.toThrow("Invalid API key");
  });

  it("expõe a origem da chave para o controller de ingestão", async () => {
    const guard = guardWith(jest.fn().mockResolvedValue({ id: "k-1", source: "iot" }));
    const request: { headers: Record<string, string>; apiKeySource?: string } = {
      headers: { "x-api-key": "chave-valida" },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.apiKeySource).toBe("iot");
  });
});
