export class RoadSegment {
  constructor(
    public readonly id: string,
    public readonly roadName: string,
    public readonly kmStart: number,
    public readonly kmEnd: number,
    public readonly mowingType: string | null,
    public readonly scoreCurrent: number | null = null,
    public readonly scoreDivergent: boolean = false,
  ) {}
}
