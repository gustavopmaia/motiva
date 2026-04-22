import { Injectable } from "@nestjs/common";
import { KmzValidationError } from "@domain/kmz-validation.error";
import {
  IRoadSegmentRepository,
  MowingFeatureMatchInput,
  RoadSegmentUpsertInput,
} from "@domain/repositories/road-segment.repository";
import { KmzParserService, ParsedKmMarker } from "@infrastructure/geospatial/kmz-parser.service";

type UploadedKmzFile = {
  originalname: string;
  buffer: Buffer;
};

@Injectable()
export class ProcessKmzUploadUseCase {
  constructor(
    private readonly kmzParser: KmzParserService,
    private readonly roadSegmentRepository: IRoadSegmentRepository,
  ) {}

  async execute(markersFile: UploadedKmzFile, mowingFile: UploadedKmzFile) {
    validateKmzFile(markersFile, "markers");
    validateKmzFile(mowingFile, "mowing");

    const [markers, mowingFeatures] = await Promise.all([
      this.kmzParser.parseMarkers(markersFile.buffer, markersFile.originalname),
      this.kmzParser.parseMowingFeatures(mowingFile.buffer, mowingFile.originalname),
    ]);

    if (markers.length < 2) {
      throw new KmzValidationError("The markers KMZ must contain at least two valid KM markers.");
    }

    const segments = buildAllSegments(markers);
    const mowingTypes = await this.roadSegmentRepository.findMowingTypes(
      segments.map((s) => ({ roadName: s.roadName, geometryWkt: s.geometryWkt })),
      mowingFeatures,
    );

    const upsertInputs: RoadSegmentUpsertInput[] = segments.map((seg, idx) => ({
      ...seg,
      mowingType: mowingTypes[idx] ?? null,
    }));

    const { created, updated } = await this.roadSegmentRepository.upsertAll(upsertInputs);

    return {
      createdSegments: created,
      updatedSegments: updated,
      segmentsWithoutIdentifiedMowingType: mowingTypes.filter((t) => t === null).length,
    };
  }
}

function validateKmzFile(file: UploadedKmzFile | undefined, fieldName: string): void {
  if (!file) throw new KmzValidationError(`The ${fieldName} file is required.`);
  if (!file.originalname.toLowerCase().endsWith(".kmz"))
    throw new KmzValidationError(`The ${fieldName} file must be a KMZ archive.`);
  if (file.buffer.length === 0) throw new KmzValidationError(`The ${fieldName} file is empty.`);
}

function buildAllSegments(markers: ParsedKmMarker[]): RoadSegmentUpsertInput[] {
  const grouped = new Map<string, ParsedKmMarker[]>();

  for (const marker of markers) {
    const key = marker.roadName.trim().toLowerCase();
    const list = grouped.get(key) ?? [];
    list.push(marker);
    grouped.set(key, list);
  }

  for (const list of grouped.values()) {
    list.sort((a, b) => a.km - b.km);
  }

  return [...grouped.values()].flatMap(buildRoadSegments);
}

function buildRoadSegments(markers: ParsedKmMarker[]): RoadSegmentUpsertInput[] {
  const segments: RoadSegmentUpsertInput[] = [];

  for (let i = 0; i < markers.length - 1; i++) {
    const from = markers[i];
    const to = markers[i + 1];
    const distance = to.km - from.km;

    if (distance <= 0) continue;

    // TODO: linear interpolation between KM markers ignores road curvature.
    // Segments spanning > 1 km may deviate significantly from the actual road path.
    // Fix: read the actual LineString geometry from the markers KMZ instead of interpolating.
    const count = Math.ceil(distance / 0.5);

    for (let s = 0; s < count; s++) {
      const t0 = s / count;
      const t1 = (s + 1) / count;
      const [lon0, lat0] = interpolate(from.coordinate, to.coordinate, t0);
      const [lon1, lat1] = interpolate(from.coordinate, to.coordinate, t1);

      segments.push({
        roadName: from.roadName,
        kmStart: round3(from.km + distance * t0),
        kmEnd: round3(from.km + distance * t1),
        mowingType: null,
        geometryWkt: `LINESTRING(${fmt(lon0)} ${fmt(lat0)}, ${fmt(lon1)} ${fmt(lat1)})`,
      });
    }
  }

  return segments;
}

function interpolate(
  [x0, y0]: [number, number],
  [x1, y1]: [number, number],
  t: number,
): [number, number] {
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function fmt(value: number): string {
  return Number(value.toFixed(12)).toString();
}
