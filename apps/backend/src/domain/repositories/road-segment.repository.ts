import { RoadSegment } from "@domain/entities/road-segment.entity";

export abstract class IRoadSegmentRepository {
  abstract findByLocation(lat: number, lon: number): Promise<RoadSegment | null>;
  abstract findById(id: string): Promise<RoadSegment | null>;
  abstract updateScore(id: string, scoreCurrent: number, scoreDivergent: boolean): Promise<void>;
}
