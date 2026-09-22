import { measured } from "../platform/telemetry/operations";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UnrecoverableError } from "bullmq";
export type ClassifierResult = {
  classification: "ok" | "attention" | "urgent";
  confidence: number;
  rawProbability: number;
  modelVersion?: string;
  preprocessingVersion?: string;
};
export function parseClassifierResult(value: unknown): ClassifierResult {
  if (!value || typeof value !== "object")
    throw new UnrecoverableError("Invalid classifier response");
  const p = value as Record<string, unknown>;
  if (
    !["ok", "attention", "urgent"].includes(String(p.classification)) ||
    typeof p.confidence !== "number" ||
    !Number.isFinite(p.confidence) ||
    p.confidence < 0 ||
    p.confidence > 1 ||
    typeof p.rawProbability !== "number" ||
    !Number.isFinite(p.rawProbability) ||
    p.rawProbability < 0 ||
    p.rawProbability > 1 ||
    (p.modelVersion !== undefined && typeof p.modelVersion !== "string") ||
    (p.preprocessingVersion !== undefined && typeof p.preprocessingVersion !== "string")
  )
    throw new UnrecoverableError("Invalid classifier response");
  return p as ClassifierResult;
}
@Injectable()
export class ClassifierClient {
  constructor(private readonly config: ConfigService) {}
  classify(photo: Buffer, correlationId: string): Promise<ClassifierResult> {
    return measured("classifier.classify", () => this.requestClassification(photo, correlationId));
  }
  async checkAvailability(): Promise<void> {
    const response = await fetch(
      `${this.config.get<string>("CLASSIFIER_URL") ?? "http://classifier:8000"}/health`,
      { redirect: "error", signal: AbortSignal.timeout(2000) },
    );
    await response.body?.cancel();
    if (!response.ok) throw new Error("Classifier is not ready");
  }
  private async requestClassification(
    photo: Buffer,
    correlationId: string,
  ): Promise<ClassifierResult> {
    const data = new FormData();
    data.append("photo", new Blob([new Uint8Array(photo)], { type: "image/jpeg" }), "capture.jpg");
    const response = await fetch(
      `${this.config.get<string>("CLASSIFIER_URL") ?? "http://classifier:8000"}/classify`,
      {
        method: "POST",
        redirect: "error",
        body: data,
        headers: { "x-request-id": correlationId },
        signal: AbortSignal.timeout(
          Number(this.config.get<number>("CLASSIFIER_TIMEOUT_MS") ?? 30000),
        ),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status))
        throw new UnrecoverableError(`Classifier rejected image (${response.status})`);
      throw new Error(`Classifier unavailable (${response.status})`);
    }
    return parseClassifierResult(await response.json());
  }
}
