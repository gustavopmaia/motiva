import { Logger } from "@nestjs/common";
import { createHash } from "crypto";
import * as argon2 from "argon2";
import { AuthService } from "./auth.service";
import {
  AuthenticationError,
  AuthorizationError,
  DuplicateResourceError,
  InvalidOperationError,
  TooManyRequestsError,
} from "../common/errors";

jest.mock("argon2", () => ({
  hash: jest.fn().mockResolvedValue("hashed"),
  verify: jest.fn().mockResolvedValue(true),
}));

const hash = argon2.hash as jest.Mock;
const verify = argon2.verify as jest.Mock;

const chain = (rows: unknown) => {
  const builder: Record<string, unknown> = {};
  for (const method of ["from", "where", "innerJoin", "orderBy", "limit", "values", "set"]) {
    builder[method] = () => builder;
  }
  builder.returning = () => builder;
  builder.then = (resolve: (value: unknown) => void) => resolve(rows);
  return builder;
};

const userRow = {
  id: "u-1",
  email: "field@motiva.com",
  name: "Field User",
  password: "stored-hash",
  role: "field",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const makeService = (selects: unknown[][] = [], inserts: unknown[][] = []) => {
  const select = jest.fn();
  selects.forEach((rows) => select.mockReturnValueOnce(chain(rows)));
  select.mockReturnValue(chain([]));

  const insert = jest.fn();
  inserts.forEach((rows) => insert.mockReturnValueOnce(chain(rows)));
  insert.mockReturnValue(chain([]));

  const txUpdate = jest.fn().mockReturnValue(chain([]));
  const transaction = jest
    .fn()
    .mockImplementation((fn: (tx: unknown) => Promise<void>) => fn({ update: txUpdate }));

  const drizzle = { db: { select, insert, transaction } };
  const jwtService = { signAsync: jest.fn().mockResolvedValue("jwt-token") };

  return {
    service: new AuthService(drizzle as never, jwtService as never),
    select,
    insert,
    transaction,
    txUpdate,
    jwtService,
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  hash.mockResolvedValue("hashed");
  verify.mockResolvedValue(true);
});

describe("AuthService.register", () => {
  it("nega antes de qualquer acesso ao banco quando o requester não é manager", async () => {
    const { service, select, insert } = makeService();

    await expect(
      service.register("novo@motiva.com", "Novo", "senha1234", null, "field"),
    ).rejects.toThrow(AuthorizationError);

    expect(select).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
  });

  it("não vaza a política de senha para um requester não autorizado", async () => {
    const { service } = makeService();

    await expect(service.register("novo@motiva.com", "Novo", "123", null, "field")).rejects.toThrow(
      AuthorizationError,
    );
  });

  it("nega quando o requester é field", async () => {
    const { service, select } = makeService();

    await expect(
      service.register("novo@motiva.com", "Novo", "senha1234", "field", "field"),
    ).rejects.toThrow(AuthorizationError);
    expect(select).not.toHaveBeenCalled();
  });

  it("rejeita senha fraca quando o requester é manager", async () => {
    const { service } = makeService();

    await expect(
      service.register("novo@motiva.com", "Novo", "123", "manager", "field"),
    ).rejects.toThrow(InvalidOperationError);
  });

  it("rejeita email já registrado quando o requester é manager", async () => {
    const { service } = makeService([[userRow]]);

    await expect(
      service.register(userRow.email, "Novo", "senha1234", "manager", "field"),
    ).rejects.toThrow(DuplicateResourceError);
  });

  it("cria o usuário com a senha hasheada e o role solicitado", async () => {
    const { service, insert } = makeService([[]], [[{ id: "u-2" }]]);

    const result = await service.register(
      "novo@motiva.com",
      "Novo",
      "senha1234",
      "manager",
      "manager",
    );

    expect(result).toEqual({ id: "u-2" });
    expect(hash).toHaveBeenCalledWith("senha1234");
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe("AuthService.login", () => {
  it("lança AuthenticationError quando o email não existe", async () => {
    const { service } = makeService([[]]);

    await expect(service.login("ninguem@motiva.com", "senha1234")).rejects.toThrow(
      AuthenticationError,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it("lança AuthenticationError quando a senha não confere", async () => {
    const { service } = makeService([[userRow]]);
    verify.mockResolvedValue(false);

    await expect(service.login(userRow.email, "errada")).rejects.toThrow(AuthenticationError);
  });

  it("assina o token com sub, email e role", async () => {
    const { service, jwtService } = makeService([[userRow]]);

    const result = await service.login(userRow.email, "senha1234");

    expect(result).toEqual({ accessToken: "jwt-token" });
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: userRow.id,
      email: userRow.email,
      role: userRow.role,
    });
  });
});

describe("AuthService.forgotPassword", () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
  });

  it("não cria token nem lança erro para email desconhecido", async () => {
    const { service, insert } = makeService([[]]);

    await expect(service.forgotPassword("ninguem@motiva.com")).resolves.toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
  });

  it("cria o token quando o usuário está abaixo do limite de tentativas", async () => {
    const { service, insert } = makeService([[userRow], [{ value: 2 }]]);

    await service.forgotPassword(userRow.email);

    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("lança TooManyRequestsError ao atingir 3 tentativas na janela", async () => {
    const { service, insert } = makeService([[userRow], [{ value: 3 }]]);

    await expect(service.forgotPassword(userRow.email)).rejects.toThrow(TooManyRequestsError);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("AuthService.resetPassword", () => {
  const validToken = {
    id: "t-1",
    userId: userRow.id,
    codeHash: createHash("sha256").update("112233").digest("hex"),
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    createdAt: new Date(),
  };

  it("lança InvalidOperationError para email desconhecido", async () => {
    const { service } = makeService([[]]);

    await expect(
      service.resetPassword("ninguem@motiva.com", "112233", "novaSenha1"),
    ).rejects.toThrow(InvalidOperationError);
  });

  it("lança InvalidOperationError quando não há token válido", async () => {
    const { service } = makeService([[userRow], []]);

    await expect(service.resetPassword(userRow.email, "112233", "novaSenha1")).rejects.toThrow(
      InvalidOperationError,
    );
  });

  it("lança InvalidOperationError quando o código não confere", async () => {
    const { service, transaction } = makeService([[userRow], [validToken]]);

    await expect(service.resetPassword(userRow.email, "999999", "novaSenha1")).rejects.toThrow(
      InvalidOperationError,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("valida a força da nova senha antes de tocar no banco", async () => {
    const { service, select } = makeService([[userRow], [validToken]]);

    await expect(service.resetPassword(userRow.email, "112233", "123")).rejects.toThrow(
      InvalidOperationError,
    );
    expect(select).not.toHaveBeenCalled();
  });

  it("consome o token e grava a nova senha na mesma transação", async () => {
    const { service, transaction, txUpdate } = makeService([[userRow], [validToken]]);

    await service.resetPassword(userRow.email, "112233", "novaSenha1");

    expect(hash).toHaveBeenCalledWith("novaSenha1");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txUpdate).toHaveBeenCalledTimes(2);
  });
});

describe("AuthService.verifyApiKey", () => {
  it("busca pelo hash da chave, nunca pela chave crua", async () => {
    const rawKey = "chave-crua";
    const keyRow = {
      id: "k-1",
      name: "iot-key",
      source: "iot",
      key: createHash("sha256").update(rawKey).digest("hex"),
      createdAt: new Date(),
    };
    const { service } = makeService([[keyRow]]);

    const result = await service.verifyApiKey(rawKey);

    expect(result).toMatchObject({ id: "k-1", source: "iot" });
    expect(result?.key).not.toBe(rawKey);
  });

  it("retorna null quando a chave não existe", async () => {
    const { service } = makeService([[]]);

    await expect(service.verifyApiKey("inexistente")).resolves.toBeNull();
  });
});
