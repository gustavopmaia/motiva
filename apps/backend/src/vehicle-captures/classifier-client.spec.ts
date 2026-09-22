import { parseClassifierResult } from "./classifier-client";
it.each([
  null,
  {},
  { classification: "urgent", confidence: 3, rawProbability: 0.8 },
  { classification: "ok", confidence: 0.8, rawProbability: NaN },
])("rejects malformed inference results: %j", (value) =>
  expect(() => parseClassifierResult(value)).toThrow(),
);
it("accepts the current contract and optional model provenance", () => {
  expect(
    parseClassifierResult({
      classification: "urgent",
      confidence: 0.9,
      rawProbability: 0.9,
      modelVersion: "sha256:abc",
    }),
  ).toMatchObject({ classification: "urgent", modelVersion: "sha256:abc" });
});
