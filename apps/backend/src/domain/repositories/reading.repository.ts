import { Reading } from "@domain/entities/reading.entity";

export abstract class IReadingRepository {
  abstract save(reading: Reading): Promise<Reading>;
  abstract findLatestBySourceBySegmentSince(segmentId: string, since: Date): Promise<Reading[]>;
}
