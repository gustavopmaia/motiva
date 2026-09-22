import { crossedRiskThreshold, fuse, readingScore, riskLevel } from "../modules/monitoring/public";
describe("risk policy v1", () => {
  it("normalizes weights for the available sources", () => {
    expect(fuse([{ source: "iot", score: 40 }])).toEqual({ score: 40, divergent: false });
    expect(
      fuse([
        { source: "iot", score: 90 },
        { source: "vehicle", score: 20 },
        { source: "satellite", score: 30 },
      ]),
    ).toEqual({ score: 56.5, divergent: true });
  });
  it("represents missing observations separately from safe vegetation", () => {
    expect(fuse([])).toBeNull();
    expect(fuse([{ source: "iot", score: 0 }])?.score).toBe(0);
  });
  it.each([
    [29.99, null],
    [30, "attention"],
    [55, "urgent"],
    [80, "critical"],
  ])("classifies score %s", (score, expected) => expect(riskLevel(score as number)).toBe(expected));
  it("detects crossings in both directions without firing within a level", () => {
    expect(crossedRiskThreshold(20, 60)).toBe(true);
    expect(crossedRiskThreshold(85, 50)).toBe(true);
    expect(crossedRiskThreshold(60, 70)).toBe(false);
  });
  it("keeps the original scoring policy and clamps the result", () => {
    expect(readingScore({ source: "iot", heightCm: 50 }, 1)).toBe(70);
    expect(readingScore({ source: "iot", heightCm: 100 }, 1)).toBe(100);
    expect(readingScore({ source: "satellite", ndvi: 0 }, 1)).toBe(0);
    expect(readingScore({ source: "vehicle", classification: "urgent" }, 0.8)).toBe(68);
  });
});
