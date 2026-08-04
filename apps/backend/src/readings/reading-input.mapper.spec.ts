import {
  InvalidReadingPayloadError,
  toCreateReadingInput,
  toIotReadingInput,
} from "./reading-input.mapper";

describe("reading-input.mapper", () => {
  it("monta leitura iot com nodeId copiado para o metadata", () => {
    const input = toCreateReadingInput({
      source: "iot",
      lat: -23.5,
      lon: -46.6,
      heightCm: 42,
      nodeId: "node-1",
    });

    expect(input).toEqual({
      source: "iot",
      lat: -23.5,
      lon: -46.6,
      heightCm: 42,
      confidence: undefined,
      metadata: { nodeId: "node-1" },
    });
  });

  it("monta leitura vehicle exigindo classification e confidence", () => {
    const input = toCreateReadingInput({
      source: "vehicle",
      lat: 0,
      lon: 0,
      classification: "attention",
      confidence: "0.84",
    });

    expect(input).toMatchObject({ classification: "attention", confidence: 0.84 });
  });

  it("monta leitura satellite copiando ndvi para o metadata", () => {
    const input = toCreateReadingInput({ source: "satellite", lat: 0, lon: 0, ndvi: 0.64 });

    expect(input).toMatchObject({ ndvi: 0.64, metadata: { ndvi: 0.64 } });
  });

  it("rejeita source desconhecido com erro de campo estruturado", () => {
    try {
      toCreateReadingInput({ source: "drone" });
      fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidReadingPayloadError);
      expect((error as InvalidReadingPayloadError).fields).toEqual([
        { field: "source", message: "source must be iot, vehicle, or satellite" },
      ]);
    }
  });

  it("acumula todos os campos inválidos em um único erro", () => {
    try {
      toIotReadingInput({ lat: "x", lon: "y" });
      fail("should have thrown");
    } catch (error) {
      const fields = (error as InvalidReadingPayloadError).fields.map((f) => f.field);
      expect(fields).toEqual(["lat", "lon", "heightCm"]);
      expect((error as InvalidReadingPayloadError).message).toBe(
        "lat must be a number; lon must be a number; heightCm must be a number",
      );
    }
  });
});
