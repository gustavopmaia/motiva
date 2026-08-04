import "reflect-metadata";
import { ArgumentMetadata, BadRequestException } from "@nestjs/common";
import { createValidationPipe } from "./validation.pipe";
import { CreateApiKeyRequestDto, LoginRequestDto, RegisterRequestDto } from "../auth/auth.docs";

const pipe = createValidationPipe();

const meta = (metatype: ArgumentMetadata["metatype"]): ArgumentMetadata => ({
  type: "body",
  metatype,
});

const run = async (metatype: ArgumentMetadata["metatype"], body: unknown) =>
  pipe.transform(body, meta(metatype));

const errorBody = async (metatype: ArgumentMetadata["metatype"], body: unknown) => {
  try {
    await run(metatype, body);
    throw new Error("expected validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as {
      message: string;
      details: { fields: { field: string; message: string }[] };
    };
  }
};

describe("createValidationPipe", () => {
  it("mantém o formato { message, details: { fields } } do parser manual", async () => {
    const body = await errorBody(RegisterRequestDto, {});

    expect(body).toEqual({
      message: "Invalid registration payload.",
      details: {
        fields: [
          { field: "email", message: "email is required" },
          { field: "name", message: "name is required" },
          { field: "password", message: "password is required" },
        ],
      },
    });
  });

  it("reporta um único erro por campo, na ordem de declaração", async () => {
    const body = await errorBody(RegisterRequestDto, { email: 123, name: "", password: 456 });

    expect(body.details.fields).toEqual([
      { field: "email", message: "email must be a string" },
      { field: "name", message: "name is required" },
      { field: "password", message: "password must be a string" },
    ]);
  });

  it("usa a mensagem de topo declarada por cada DTO", async () => {
    const login = await errorBody(LoginRequestDto, {});
    expect(login.message).toBe("Invalid login payload.");

    const apiKey = await errorBody(CreateApiKeyRequestDto, {});
    expect(apiKey.message).toBe("Invalid API key payload.");
  });

  it("valida email pela regra frouxa anterior (precisa conter @)", async () => {
    const body = await errorBody(RegisterRequestDto, {
      email: "sem-arroba",
      name: "Nome",
      password: "senha1234",
    });

    expect(body.details.fields).toEqual([
      { field: "email", message: "email must be a valid email" },
    ]);
  });

  it("lista os valores permitidos de um enum como antes", async () => {
    const body = await errorBody(CreateApiKeyRequestDto, { source: "drone" });

    expect(body.details.fields).toEqual([
      { field: "source", message: "source must be iot, vehicle, or satellite" },
    ]);
  });

  it("faz trim em email e name, e mantém a senha intacta", async () => {
    const result = (await run(RegisterRequestDto, {
      email: "  manager@motiva.app  ",
      name: "  Gestor  ",
      password: "  senha1234  ",
    })) as RegisterRequestDto;

    expect(result.email).toBe("manager@motiva.app");
    expect(result.name).toBe("Gestor");
    expect(result.password).toBe("  senha1234  ");
  });

  it("rejeita string só com espaços como campo obrigatório ausente", async () => {
    const body = await errorBody(RegisterRequestDto, {
      email: "manager@motiva.app",
      name: "   ",
      password: "senha1234",
    });

    expect(body.details.fields).toEqual([{ field: "name", message: "name is required" }]);
  });

  it("descarta campos desconhecidos do payload", async () => {
    const result = (await run(LoginRequestDto, {
      email: "manager@motiva.app",
      password: "senha1234",
      isAdmin: true,
    })) as LoginRequestDto & { isAdmin?: boolean };

    expect(result.isAdmin).toBeUndefined();
  });

  it("preserva role para o controller decidir o fallback", async () => {
    const result = (await run(RegisterRequestDto, {
      email: "manager@motiva.app",
      name: "Gestor",
      password: "senha1234",
      role: "manager",
    })) as RegisterRequestDto;

    expect(result.role).toBe("manager");
  });

  it("ignora handlers que ainda recebem body sem DTO", async () => {
    const body = { qualquer: "coisa" };

    await expect(run(Object, body)).resolves.toBe(body);
  });
});
