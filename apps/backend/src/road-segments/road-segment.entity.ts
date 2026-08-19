/** GeoJSON LineString com o traçado do trecho, pronto para plotar no mapa. */
export type SegmentGeometry = {
  type: "LineString";
  coordinates: [number, number][];
};

export type RoadSegment = {
  id: string;
  roadName: string;
  kmStart: number;
  kmEnd: number;
  mowingType: string | null;
  scoreCurrent: number | null;
  scoreDivergent: boolean;
  geometry: SegmentGeometry;
};
