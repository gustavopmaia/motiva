import { updateRejection } from "./work-order-policy";
it.each(["open", "in_progress", "completed"])(
  "does not mutate a completed work order to %s",
  (next) => expect(updateRejection("completed", next)).not.toBeNull(),
);
it.each([
  ["open", "in_progress"],
  ["in_progress", "open"],
  ["open", "open"],
])("allows the existing transition %s -> %s", (before, after) =>
  expect(updateRejection(before, after)).toBeNull(),
);
it("requires completion through its dedicated workflow", () =>
  expect(updateRejection("open", "completed")).not.toBeNull());
