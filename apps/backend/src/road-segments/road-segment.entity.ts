/** GeoJSON LineString com o traçado do trecho, pronto para plotar no mapa. */
export type SegmentGeometry = {
  type: "LineString";
  coordinates: [number, number][];
};

// "unica" cobre rodovia de pista unica, sem duplicacao Norte/Sul.
export const ROAD_SEGMENT_DIRECTIONS = ["norte", "sul", "leste", "oeste", "unica"] as const;
export type RoadSegmentDirection = (typeof ROAD_SEGMENT_DIRECTIONS)[number];

export type RoadSegment = {
  id: string;
  roadName: string;
  kmStart: number;
  kmEnd: number;
  mowingType: string | null;
  direction: RoadSegmentDirection | null;
  scoreCurrent: number | null;
  scoreDivergent: boolean;
  geometry: SegmentGeometry;
};
