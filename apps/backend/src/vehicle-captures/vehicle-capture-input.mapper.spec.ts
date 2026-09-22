import { toCreateVehicleCaptureInput } from "./vehicle-capture-input.mapper";
describe("capture observation time", () => {
  it("rejects future observations at the upload boundary", () => {
    expect(() =>
      toCreateVehicleCaptureInput({
        lat: 0,
        lon: 0,
        capturedAt: new Date(Date.now() + 600_000).toISOString(),
      }),
    ).toThrow("5 minutes");
  });
  it("preserves delayed observations and tolerates bounded clock skew", () => {
    for (const offset of [-48 * 3600_000, 240_000]) {
      const value = new Date(Date.now() + offset);
      expect(
        toCreateVehicleCaptureInput({ lat: 0, lon: 0, capturedAt: value.toISOString() }).capturedAt,
      ).toEqual(value);
    }
  });
});
