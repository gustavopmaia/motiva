import { RoadSegment } from "@domain/entities/road-segment.entity";

export const RoadSegmentRepository = Symbol("RoadSegmentRepository");

export interface RoadSegmentRepository {
  findByLocation(lat: number, lon: number): Promise<RoadSegment | null>;
  findById(id: string): Promise<RoadSegment | null>;
  updateScore(id: string, scoreCurrent: number, scoreDivergent: boolean): Promise<void>;
}
