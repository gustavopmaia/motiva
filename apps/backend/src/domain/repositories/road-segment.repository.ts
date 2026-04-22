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

export abstract class IRoadSegmentRepository {
  abstract findMowingTypes(
    segments: RoadSegmentUpsertInput[],
    mowingFeatures: MowingFeatureMatchInput[],
  ): Promise<(string | null)[]>;

  abstract upsertAll(
    segments: RoadSegmentUpsertInput[],
  ): Promise<{ created: number; updated: number }>;
}
