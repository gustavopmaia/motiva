import { RoadSegment } from "@domain/entities/road-segment.entity";

export abstract class IRoadSegmentRepository {
  abstract findByLocation(lat: number, lon: number): Promise<RoadSegment | null>;
}
