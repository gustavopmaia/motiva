import { Injectable } from "@nestjs/common";
import { DrizzleService } from "../database/drizzle.service";
import { FusionService } from "./fusion.service";
import { SegmentLocator } from "../road-segments/segment-locator";
import { Transaction } from "../platform/persistence/transaction";
import { CreateReadingInput, Reading } from "../modules/monitoring/domain/reading";
import { IngestReading } from "../modules/monitoring/application/ingest-reading";
import { DrizzleReadingsRepository } from "../modules/monitoring/infrastructure/drizzle-readings.repository";
@Injectable()
export class ReadingsService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly fusion: FusionService,
    private readonly locator: SegmentLocator,
  ) {}
  create(input: CreateReadingInput, transaction?: Transaction): Promise<Reading> {
    return new IngestReading(
      this.locator,
      new DrizzleReadingsRepository(this.drizzle, this.fusion, transaction),
    ).execute(input);
  }
}
