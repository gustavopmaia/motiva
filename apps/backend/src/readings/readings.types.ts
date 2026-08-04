import { ReadingClassification } from "./reading.entity";

type CreateIotReadingInput = {
  source: "iot";
  lat: number;
  lon: number;
  heightCm: number;
  confidence?: number;
  metadata?: Record<string, unknown> | null;
};

type CreateVehicleReadingInput = {
  source: "vehicle";
  lat: number;
  lon: number;
  classification: ReadingClassification;
  confidence: number;
  metadata?: Record<string, unknown> | null;
};

type CreateSatelliteReadingInput = {
  source: "satellite";
  lat: number;
  lon: number;
  ndvi: number;
  confidence?: number;
  metadata?: Record<string, unknown> | null;
};

export type CreateReadingInput =
  | CreateIotReadingInput
  | CreateVehicleReadingInput
  | CreateSatelliteReadingInput;
