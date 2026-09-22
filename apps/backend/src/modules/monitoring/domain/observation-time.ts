export function validObservationTime(value: Date, now = Date.now()): boolean {
  return Number.isFinite(value.getTime()) && value.getTime() <= now + 300_000;
}
