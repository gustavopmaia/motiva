import { RiskChangedHandler } from "./risk-changed.handler";
import { MaintenanceRiskContext } from "./risk-changed.ports";
const event = {
  segmentId: "segment",
  readingId: "reading",
  score: 80,
  level: "critical" as const,
  interventionAt: null,
};
function scenario(score: number | null, intervention: string | null = null) {
  const ensureMaintenance = jest.fn();
  const handler = new RiskChangedHandler({
    withEvent: async (_event, action) =>
      action({
        score,
        lastInterventionAt: intervention,
        ensureMaintenance,
      } as MaintenanceRiskContext),
  });
  return { handler, ensureMaintenance };
}
it("ignores an event from the previous maintenance cycle", async () => {
  const { handler, ensureMaintenance } = scenario(90, "2026-09-11T12:00:00.000Z");
  await handler.execute(event);
  expect(ensureMaintenance).not.toHaveBeenCalled();
});
it("uses the current risk when another reading updated the score within the same level", async () => {
  const { handler, ensureMaintenance } = scenario(95);
  await handler.execute(event);
  expect(ensureMaintenance).toHaveBeenCalledWith("critical", 95);
});
it.each([null, 0, 60])("does not act on a superseded risk level: %s", async (score) => {
  const { handler, ensureMaintenance } = scenario(score);
  await handler.execute(event);
  expect(ensureMaintenance).not.toHaveBeenCalled();
});
