import { Logger } from "@nestjs/common";
import { DispatchCronService } from "./dispatch-cron.service";

describe("DispatchCronService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("não roda dispatch quando não precisa replanejar", async () => {
    const dispatchService = { runDispatch: jest.fn() };
    const service = new DispatchCronService(dispatchService as any);

    await service.handleDispatchCron();

    expect(dispatchService.runDispatch).not.toHaveBeenCalled();
  });

  it("roda dispatch uma vez quando precisa replanejar", async () => {
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    const dispatchService = { runDispatch: jest.fn().mockResolvedValue(undefined) };
    const service = new DispatchCronService(dispatchService as any);

    service.markNeedsReplan();
    await service.handleDispatchCron();
    await service.handleDispatchCron();

    expect(dispatchService.runDispatch).toHaveBeenCalledTimes(1);
  });
});
