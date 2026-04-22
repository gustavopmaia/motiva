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
    this.assertKmzFile(markersFile, "markers");
    this.assertKmzFile(mowingFile, "mowing");

    const [markers, mowingFeatures] = await Promise.all([
      this.kmzParser.parseMarkers(markersFile.buffer, markersFile.originalname),
      this.kmzParser.parseMowingFeatures(mowingFile.buffer, mowingFile.originalname),
    ]);

    if (markers.length < 2) {
      throw new KmzValidationError("The markers KMZ must contain at least two valid KM markers.");
    }

    const segments = this.buildSegments(markers);
    const mowingTypes = await this.roadSegmentRepository.findMowingTypes(segments, mowingFeatures);

    const upsertInputs = segments.map((seg, idx) => ({
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

  private assertKmzFile(file: UploadedKmzFile | undefined, fieldName: string) {
    if (!file) {
      throw new KmzValidationError(`The ${fieldName} file is required.`);
    }

    if (!file.originalname.toLowerCase().endsWith(".kmz")) {
      throw new KmzValidationError(`The ${fieldName} file must be a KMZ archive.`);
    }

    if (file.buffer.length === 0) {
      throw new KmzValidationError(`The ${fieldName} file is empty.`);
    }
  }

  private buildSegments(markers: ParsedKmMarker[]): RoadSegmentUpsertInput[] {
    const roads = new Map<string, ParsedKmMarker[]>();

    for (const marker of markers) {
      const key = marker.roadName.trim().toLowerCase();
      const roadMarkers = roads.get(key) ?? [];
      roadMarkers.push(marker);
      roads.set(key, roadMarkers);
    }

    const segments: RoadSegmentUpsertInput[] = [];

    for (const roadMarkers of roads.values()) {
      roadMarkers.sort((left, right) => left.km - right.km);

      for (let i = 0; i < roadMarkers.length - 1; i += 1) {
        const from = roadMarkers[i];
        const to = roadMarkers[i + 1];
        const distance = to.km - from.km;

        if (distance <= 0) {
          continue;
        }

        // TODO: linear interpolation between KM markers ignores road curvature.
        // Segments spanning > 1 km may deviate significantly from the actual road path.
        const count = Math.ceil(distance / 0.5);

        for (let part = 0; part < count; part += 1) {
          const start = part / count;
          const end = (part + 1) / count;
          const startLongitude =
            from.coordinate[0] + (to.coordinate[0] - from.coordinate[0]) * start;
          const startLatitude =
            from.coordinate[1] + (to.coordinate[1] - from.coordinate[1]) * start;
          const endLongitude = from.coordinate[0] + (to.coordinate[0] - from.coordinate[0]) * end;
          const endLatitude = from.coordinate[1] + (to.coordinate[1] - from.coordinate[1]) * end;

          segments.push({
            roadName: from.roadName,
            kmStart: Number((from.km + distance * start).toFixed(3)),
            kmEnd: Number((from.km + distance * end).toFixed(3)),
            mowingType: null,
            geometryWkt: `LINESTRING(${Number(startLongitude.toFixed(12)).toString()} ${Number(
              startLatitude.toFixed(12),
            ).toString()}, ${Number(endLongitude.toFixed(12)).toString()} ${Number(
              endLatitude.toFixed(12),
            ).toString()})`,
          });
        }
      }
    }

    return segments;
  }
}
