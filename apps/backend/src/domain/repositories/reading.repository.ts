import { Reading } from "@domain/entities/reading.entity";

export const ReadingRepository = Symbol("ReadingRepository");

export interface ReadingRepository {
  save(reading: Reading): Promise<Reading>;
  findLatestBySourceBySegmentSince(segmentId: string, since: Date): Promise<Reading[]>;
}
