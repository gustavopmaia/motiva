import { Injectable } from "@nestjs/common";
import { GeoJsonValidationError } from "@domain/geojson-validation.error";
import {
  IRoadSegmentRepository,
  RoadSegmentUpsertInput,
} from "@domain/repositories/road-segment.repository";
import {
  GeoJsonParserService,
  ParsedKmMarker,
} from "@infrastructure/geospatial/geojson-parser.service";

type UploadedGeoJsonFile = {
  originalname: string;
  buffer: Buffer;
};

@Injectable()
export class ProcessGeoJsonUploadUseCase {
  constructor(
    private readonly geoJsonParser: GeoJsonParserService,
    private readonly roadSegmentRepository: IRoadSegmentRepository,
  ) {}

  async execute(markersFile: UploadedGeoJsonFile, mowingFile: UploadedGeoJsonFile) {
    this.assertFile(markersFile, "markers");
    this.assertFile(mowingFile, "mowing");

    const markers = this.geoJsonParser.parseMarkers(markersFile.buffer, markersFile.originalname);
    const mowingFeatures = this.geoJsonParser.parseMowingFeatures(
      mowingFile.buffer,
      mowingFile.originalname,
    );

    if (markers.length < 2) {
      throw new GeoJsonValidationError(
        "The markers file must contain at least two valid KM markers.",
      );
    }

    const segments = this.buildSegments(markers);
    const mowingTypes = await this.roadSegmentRepository.findMowingTypes(segments, mowingFeatures);
    const { created, updated } = await this.roadSegmentRepository.upsertAll(
      segments.map((segment, index) => ({
        ...segment,
        mowingType: mowingTypes[index] ?? null,
      })),
    );

    return {
      createdSegments: created,
      updatedSegments: updated,
      segmentsWithoutIdentifiedMowingType: mowingTypes.filter((type) => type === null).length,
    };
  }

  private assertFile(file: UploadedGeoJsonFile | undefined, fieldName: string) {
    if (!file) {
      throw new GeoJsonValidationError(`The ${fieldName} file is required.`);
    }

    if (file.buffer.length === 0) {
      throw new GeoJsonValidationError(`The ${fieldName} file is empty.`);
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

      for (let index = 0; index < roadMarkers.length - 1; index += 1) {
        const from = roadMarkers[index];
        const to = roadMarkers[index + 1];
        const distance = to.km - from.km;

        if (distance <= 0) {
          continue;
        }

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
