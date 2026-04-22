export type MowingFeatureMatchInput = {
  roadName: string | null;
  mowingType: string;
  geometryWkt: string;
};

export type RoadSegmentUpsertInput = {
  roadName: string;
  kmStart: number;
  kmEnd: number;
  geometryWkt: string;
  mowingType: string | null;
};

export type SegmentGeometryInput = {
  roadName: string;
  geometryWkt: string;
};

export abstract class IRoadSegmentRepository {
  abstract findMowingTypes(
    segments: SegmentGeometryInput[],
    mowingFeatures: MowingFeatureMatchInput[],
  ): Promise<(string | null)[]>;

  abstract upsertAll(
    segments: RoadSegmentUpsertInput[],
  ): Promise<{ created: number; updated: number }>;
}
