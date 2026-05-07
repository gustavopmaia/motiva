export type RoadSegment = {
  id: string;
  roadName: string;
  kmStart: number;
  kmEnd: number;
  mowingType: string | null;
  scoreCurrent: number | null;
  scoreDivergent: boolean;
};
