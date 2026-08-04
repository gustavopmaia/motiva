import "reflect-metadata";
import { ArgumentMetadata, BadRequestException } from "@nestjs/common";
import { createValidationPipe } from "../common/validation.pipe";
import {
  CreateWorkOrderRequestDto,
  UpdateWorkOrderRequestDto,
  WorkOrderFiltersDto,
} from "./work-orders.docs";

const pipe = createValidationPipe();

const run = async (metatype: ArgumentMetadata["metatype"], value: unknown, type = "body") =>
  pipe.transform(value, { type, metatype } as ArgumentMetadata);

const errorBody = async (metatype: ArgumentMetadata["metatype"], value: unknown, type = "body") => {
  try {
    await run(metatype, value, type);
    throw new Error("expected validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as {
      message: string;
      details: { fields: { field: string; message: string }[] };
    };
  }
};

const validCreate = {
  segmentId: "seg-1",
  alertId: "a-1",
  priority: "urgent",
  scoreAtCreation: 74.5,
};

describe("CreateWorkOrderRequestDto", () => {
  it("reporta todos os campos obrigatórios ausentes de uma vez", async () => {
    const body = await errorBody(CreateWorkOrderRequestDto, {});

    expect(body.message).toBe("Invalid work order payload.");
    expect(body.details.fields).toEqual([
      { field: "segmentId", message: "segmentId is required" },
      { field: "alertId", message: "alertId is required" },
      { field: "priority", message: "priority must be attention, urgent, or critical" },
      { field: "scoreAtCreation", message: "scoreAtCreation must be a number" },
    ]);
  });

  it("aceita score numérico enviado como string", async () => {
    const result = (await run(CreateWorkOrderRequestDto, {
      ...validCreate,
      scoreAtCreation: "74.5",
    })) as CreateWorkOrderRequestDto;

    expect(result.scoreAtCreation).toBe(74.5);
  });

  it("rejeita prioridade fora do enum", async () => {
    const body = await errorBody(CreateWorkOrderRequestDto, { ...validCreate, priority: "meh" });

    expect(body.details.fields).toEqual([
      { field: "priority", message: "priority must be attention, urgent, or critical" },
    ]);
  });
});

describe("UpdateWorkOrderRequestDto", () => {
  it("recusa completed e aponta o endpoint correto", async () => {
    const body = await errorBody(UpdateWorkOrderRequestDto, { status: "completed" });

    expect(body.details.fields).toEqual([
      {
        field: "status",
        message:
          "status must be open or in_progress; use POST /:id/complete to complete a work order",
      },
    ]);
  });

  it("distingue campo ausente de limpeza explícita com null", async () => {
    const absent = (await run(UpdateWorkOrderRequestDto, {
      status: "in_progress",
    })) as UpdateWorkOrderRequestDto;
    expect(absent.team).toBeUndefined();

    const cleared = (await run(UpdateWorkOrderRequestDto, {
      team: null,
    })) as UpdateWorkOrderRequestDto;
    expect(cleared.team).toBeNull();
  });

  it("rejeita team que não é string em vez de gravar [object Object]", async () => {
    const body = await errorBody(UpdateWorkOrderRequestDto, { team: { nome: "equipe" } });

    expect(body.details.fields).toEqual([{ field: "team", message: "team must be a string" }]);
  });
});

describe("WorkOrderFiltersDto", () => {
  it("rejeita status de filtro inválido", async () => {
    const body = await errorBody(WorkOrderFiltersDto, { status: "cancelado" }, "query");

    expect(body.message).toBe("Invalid work order filters.");
    expect(body.details.fields).toEqual([{ field: "status", message: "status filter is invalid" }]);
  });

  it("aceita ausência de filtros", async () => {
    const result = (await run(WorkOrderFiltersDto, {}, "query")) as WorkOrderFiltersDto;

    expect(result.status).toBeUndefined();
    expect(result.team).toBeUndefined();
  });

  it("aceita completed como filtro de listagem", async () => {
    const result = (await run(
      WorkOrderFiltersDto,
      { status: "completed" },
      "query",
    )) as WorkOrderFiltersDto;

    expect(result.status).toBe("completed");
  });
});
