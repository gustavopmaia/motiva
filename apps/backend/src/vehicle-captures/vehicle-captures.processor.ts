import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";
import { DrizzleService } from "../database/drizzle.service";
import { vehicleCaptures } from "../database/schema";
import { PHOTO_CLASSIFICATION_QUEUE, PhotoClassificationRequestedJob } from "../common/queues";
import { ReadingClassification } from "../readings/reading.entity";
import { ReadingsService } from "../readings/readings.service";
import { VehicleCapturesService } from "./vehicle-captures.service";

type ClassifierResponse = {
  classification: ReadingClassification;
  confidence: number;
  rawProbability: number;
};

@Processor(PHOTO_CLASSIFICATION_QUEUE)
export class VehicleCapturesProcessor extends WorkerHost {
  private readonly logger = new Logger(VehicleCapturesProcessor.name);
  private readonly classifierUrl: string;

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly config: ConfigService,
    private readonly vehicleCapturesService: VehicleCapturesService,
    private readonly readingsService: ReadingsService,
  ) {
    super();
    this.classifierUrl = this.config.get<string>("CLASSIFIER_URL") ?? "http://classifier:8000";
  }

  async process(job: Job<PhotoClassificationRequestedJob>): Promise<void> {
    const { captureId } = job.data;

    const [capture] = await this.drizzle.db
      .select()
      .from(vehicleCaptures)
      .where(eq(vehicleCaptures.id, captureId));

    if (!capture) {
      this.logger.error(`job=${job.name} captureId=${captureId} not found — descartando`);
      return;
    }

    const photoBuffer = readFileSync(
      join(this.vehicleCapturesService.getStorageDir(), capture.photoPath),
    );

    const formData = new FormData();
    formData.append("photo", new Blob([photoBuffer], { type: "image/jpeg" }), capture.photoPath);

    const response = await fetch(`${this.classifierUrl}/classify`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`classifier respondeu HTTP ${response.status} para captureId=${captureId}`);
    }

    const result = (await response.json()) as ClassifierResponse;

    await this.drizzle.db
      .update(vehicleCaptures)
      .set({
        classification: result.classification,
        confidence: result.confidence,
        classifiedAt: new Date(),
      })
      .where(eq(vehicleCaptures.id, captureId));

    const reading = await this.readingsService.create({
      source: "vehicle",
      lat: capture.lat,
      lon: capture.lon,
      classification: result.classification,
      confidence: result.confidence,
      metadata: { captureId },
    });

    this.logger.log(
      `job=${job.name} captureId=${captureId} classification=${result.classification} ` +
        `confidence=${result.confidence.toFixed(2)} readingId=${reading.id}`,
    );
  }
}
