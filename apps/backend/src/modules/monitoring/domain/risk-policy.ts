export type Source = "iot" | "vehicle" | "satellite";
export type RiskLevel = "attention" | "urgent" | "critical";
export const RISK_POLICY_VERSION = "v1";
const WEIGHTS: Record<Source, number> = { iot: 0.5, vehicle: 0.35, satellite: 0.15 };
export function riskLevel(score: number): RiskLevel | null {
  return score >= 80 ? "critical" : score >= 55 ? "urgent" : score >= 30 ? "attention" : null;
}
export function fuse(
  readings: { source: Source; score: number }[],
): { score: number; divergent: boolean } | null {
  if (!readings.length) return null;
  const weight = readings.reduce((sum, r) => sum + WEIGHTS[r.source], 0);
  const score = Number(
    readings.reduce((sum, r) => sum + (r.score * WEIGHTS[r.source]) / weight, 0).toFixed(2),
  );
  const scores = readings.map((r) => r.score);
  return { score, divergent: scores.length > 1 && Math.max(...scores) - Math.min(...scores) > 40 };
}
export function crossedRiskThreshold(before: number, after: number): boolean {
  return [30, 55, 80].some((t) => (before < t && after >= t) || (before >= t && after < t));
}
export function readingScore(
  input: {
    source: Source;
    heightCm?: number;
    classification?: "ok" | "attention" | "urgent";
    ndvi?: number;
  },
  confidence: number,
): number {
  const value =
    input.source === "iot"
      ? input.heightCm! * 1.4
      : input.source === "vehicle"
        ? { ok: 10, attention: 50, urgent: 85 }[input.classification!] * confidence
        : (input.ndvi! - 0.2) * 200;
  return Number(Math.max(0, Math.min(100, value)).toFixed(2));
}
