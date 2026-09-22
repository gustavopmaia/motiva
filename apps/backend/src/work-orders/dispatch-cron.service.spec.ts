import { DispatchCronService } from "./dispatch-cron.service";
it("bounds overlapping local polls while the database coordinates replicas", async () => {
  let release!: () => void;
  const runDispatch = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const scheduler = new DispatchCronService({ runDispatch } as never, {} as never);
  const first = scheduler.handleDispatchCron();
  await scheduler.handleDispatchCron();
  expect(runDispatch).toHaveBeenCalledTimes(1);
  expect(runDispatch).toHaveBeenCalledWith(true);
  release();
  await first;
});
