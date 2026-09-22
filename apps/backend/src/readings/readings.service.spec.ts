import { ReadingsService } from "./readings.service";
import { NotFoundError } from "../common/errors";
it("does not persist coordinates that cannot be matched to a road", async () => {
  const transaction = jest.fn();
  const service = new ReadingsService(
    { db: { transaction } } as never,
    {} as never,
    { locate: jest.fn().mockRejectedValue(new NotFoundError("Outside accepted radius")) } as never,
  );
  await expect(service.create({ source: "iot", lat: 0, lon: 0, heightCm: 10 })).rejects.toThrow(
    NotFoundError,
  );
  expect(transaction).not.toHaveBeenCalled();
});
