import { parseCorsOrigins, validateEnv } from "./env";

const valid = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/motiva",
  JWT_SECRET: "um-segredo-bem-longo-para-testes",
  REDIS_URL: "redis://localhost:6379",
};

describe("validateEnv", () => {
  it("aceita a configuração mínima e aplica os padrões", () => {
    const result = validateEnv({ ...valid });

    expect(result.NODE_ENV).toBe("development");
    expect(result.PORT).toBe(3000);
  });

  it("lista todas as variáveis obrigatórias que faltam", () => {
    expect(() => validateEnv({ JWT_SECRET: valid.JWT_SECRET })).toThrow(
      "Missing required environment variables: DATABASE_URL, REDIS_URL",
    );
  });

  it("rejeita JWT_SECRET curto demais", () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: "curto" })).toThrow(
      "JWT_SECRET must be at least 16 characters",
    );
  });

  it("rejeita NODE_ENV desconhecido", () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: "staging" })).toThrow("NODE_ENV must be one of");
  });

  it("converte PORT para número", () => {
    expect(validateEnv({ ...valid, PORT: "8080" }).PORT).toBe(8080);
  });

  it("rejeita PORT inválida", () => {
    expect(() => validateEnv({ ...valid, PORT: "abc" })).toThrow("PORT must be an integer");
    expect(() => validateEnv({ ...valid, PORT: "70000" })).toThrow("PORT must be an integer");
  });
});

describe("parseCorsOrigins", () => {
  it("aceita uma única origem", () => {
    expect(parseCorsOrigins("https://motiva.nyxdev.com.br")).toEqual([
      "https://motiva.nyxdev.com.br",
    ]);
  });

  it("aceita várias origens separadas por vírgula e ignora espaços", () => {
    expect(parseCorsOrigins("https://motiva.nyxdev.com.br, http://localhost:5173")).toEqual([
      "https://motiva.nyxdev.com.br",
      "http://localhost:5173",
    ]);
  });

  it("devolve undefined quando não há origem configurada", () => {
    expect(parseCorsOrigins(undefined)).toBeUndefined();
    expect(parseCorsOrigins("")).toBeUndefined();
    expect(parseCorsOrigins("  ,  ")).toBeUndefined();
  });
});
