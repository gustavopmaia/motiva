import { Injectable } from "@nestjs/common";
import { basename, extname } from "path";
import { GeoJsonValidationError } from "@domain/geojson-validation.error";

type Coordinate = [number, number];
type JsonObject = Record<string, unknown>;

export type ParsedKmMarker = {
  roadName: string;
  km: number;
  coordinate: Coordinate;
};

export type ParsedMowingFeature = {
  roadName: string | null;
  mowingType: string;
  geometryWkt: string;
};

const KM_PROPERTY_ALIASES = new Set([
  "km",
  "km_inicial",
  "km_final",
  "km_ref",
  "km_referencia",
  "marco_km",
  "quilometro",
  "quilometragem",
  "valor_km",
]);

const MOWING_TYPE_PROPERTY_ALIASES = new Set([
  "mowing_type",
  "tipo_rocada",
  "tipo_de_rocada",
  "tiporocada",
  "tp_rocada",
]);

const ROAD_NAME_PROPERTY_ALIASES = new Set([
  "road_name",
  "road",
  "rod_name",
  "rodovia",
  "rodovia_nome",
  "highway",
  "route",
  "route_name",
  "br",
]);

const LABEL_PROPERTY_ALIASES = new Set(["name", "label", "title"]);

const DESCRIPTION_PROPERTY_ALIASES = new Set(["description", "descricao", "desc"]);

@Injectable()
export class GeoJsonParserService {
  parseMarkers(buffer: Buffer, fileName: string): ParsedKmMarker[] {
    const fallbackRoadName = this.inferRoadNameFromFileName(fileName) ?? this.fileLabel(fileName);

    return this.readFeatures(buffer)
      .map((feature) => this.parseMarkerFeature(feature, fallbackRoadName))
      .filter((marker): marker is ParsedKmMarker => marker !== null);
  }

  parseMowingFeatures(buffer: Buffer, fileName: string): ParsedMowingFeature[] {
    const fallbackRoadName = this.inferRoadNameFromFileName(fileName);

    return this.readFeatures(buffer).flatMap((feature) =>
      this.parseMowingFeature(feature, fallbackRoadName),
    );
  }

  private readFeatures(buffer: Buffer): JsonObject[] {
    const content = buffer
      .toString("utf8")
      .replace(/^\uFEFF/, "")
      .trim();

    if (!content) {
      throw new GeoJsonValidationError("The uploaded file is empty.");
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(content);
    } catch {
      throw new GeoJsonValidationError("Failed to parse the uploaded GeoJSON file.");
    }

    const root = this.asRecord(parsed);

    if (!root) {
      throw new GeoJsonValidationError("The uploaded file must be a valid GeoJSON document.");
    }

    if (root.type === "FeatureCollection" && Array.isArray(root.features)) {
      return root.features.map((feature) => this.asRecord(feature)).filter(Boolean) as JsonObject[];
    }

    if (root.type === "Feature") {
      return [root];
    }

    throw new GeoJsonValidationError(
      "The uploaded file must be a GeoJSON FeatureCollection or Feature.",
    );
  }

  private parseMarkerFeature(
    feature: JsonObject,
    fallbackRoadName: string | null,
  ): ParsedKmMarker | null {
    const geometry = this.asRecord(feature.geometry);

    if (!geometry || geometry.type !== "Point") {
      return null;
    }

    const coordinate = this.readCoordinate(geometry.coordinates);

    if (!coordinate) {
      return null;
    }

    const properties = this.readProperties(feature.properties);
    const label = this.findFeatureLabel(properties);
    const description = this.findFeatureDescription(properties);
    const markerText = label ?? description;
    const km =
      this.parseKmNumber(this.findPropertyValue(properties, (key) => this.matchesKmKey(key))) ??
      this.parseKmNumber(markerText);

    if (km === null) {
      return null;
    }

    const roadName =
      this.findPropertyValue(properties, (key) => this.matchesRoadNameKey(key)) ??
      this.extractRoadNameFromText(label) ??
      this.extractRoadNameFromText(description) ??
      fallbackRoadName;

    if (!roadName) {
      return null;
    }

    return {
      roadName,
      km,
      coordinate,
    };
  }

  private parseMowingFeature(
    feature: JsonObject,
    fallbackRoadName: string | null,
  ): ParsedMowingFeature[] {
    const geometry = this.asRecord(feature.geometry);

    if (!geometry) {
      return [];
    }

    const properties = this.readProperties(feature.properties);
    const label = this.findFeatureLabel(properties);
    const description = this.findFeatureDescription(properties);
    const mowingType =
      this.findPropertyValue(properties, (key) => this.matchesMowingTypeKey(key)) ??
      label ??
      description;

    if (!mowingType) {
      return [];
    }

    const roadName =
      this.findPropertyValue(properties, (key) => this.matchesRoadNameKey(key)) ??
      this.extractRoadNameFromText(label) ??
      this.extractRoadNameFromText(description) ??
      fallbackRoadName;

    return this.geometryToWkts(geometry).map((geometryWkt) => ({
      roadName,
      mowingType,
      geometryWkt,
    }));
  }

  private readProperties(value: unknown): Record<string, string> {
    const properties = this.asRecord(value);

    if (!properties) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(properties)
        .map(([key, entry]) => [key, this.normalizePropertyValue(entry)] as const)
        .filter((entry): entry is [string, string] => entry[1] !== null),
    );
  }

  private geometryToWkts(geometry: JsonObject): string[] {
    switch (geometry.type) {
      case "LineString": {
        const coordinates = this.readCoordinateList(geometry.coordinates);
        return coordinates.length >= 2 ? [this.toLineStringWkt(coordinates)] : [];
      }
      case "MultiLineString":
        return this.toArray(geometry.coordinates)
          .map((entry) => this.readCoordinateList(entry))
          .filter((coordinates) => coordinates.length >= 2)
          .map((coordinates) => this.toLineStringWkt(coordinates));
      case "Polygon": {
        const coordinates = this.readCoordinateList(this.toArray(geometry.coordinates)[0]);
        return coordinates.length >= 4 ? [this.toPolygonWkt(coordinates)] : [];
      }
      case "MultiPolygon":
        return this.toArray(geometry.coordinates)
          .map((entry) => this.readCoordinateList(this.toArray(entry)[0]))
          .filter((coordinates) => coordinates.length >= 4)
          .map((coordinates) => this.toPolygonWkt(coordinates));
      case "GeometryCollection":
        return this.toArray(geometry.geometries)
          .map((entry) => this.asRecord(entry))
          .filter((entry): entry is JsonObject => entry !== null)
          .flatMap((entry) => this.geometryToWkts(entry));
      default:
        return [];
    }
  }

  private readCoordinateList(value: unknown): Coordinate[] {
    return this.toArray(value)
      .map((entry) => this.readCoordinate(entry))
      .filter((coordinate): coordinate is Coordinate => coordinate !== null);
  }

  private readCoordinate(value: unknown): Coordinate | null {
    if (!Array.isArray(value) || value.length < 2) {
      return null;
    }

    const longitude = Number(value[0]);
    const latitude = Number(value[1]);

    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      return null;
    }

    return [longitude, latitude];
  }

  private parseKmNumber(value: string | null): number | null {
    if (!value) {
      return null;
    }

    const match =
      value.match(/\bkm\b\D*(-?\d+(?:[.,]\d+)?)/i) ?? value.match(/\bkm(-?\d+(?:[.,]\d+)?)/i);

    if (match) {
      const parsedValue = Number.parseFloat(match[1].replace(",", "."));
      return Number.isFinite(parsedValue) ? parsedValue : null;
    }

    const numericMatches = Array.from(value.matchAll(/-?\d+(?:[.,]\d+)?/g));
    const lastMatch = numericMatches.at(-1)?.[0];

    if (!lastMatch) {
      return null;
    }

    const parsedValue = Number.parseFloat(lastMatch.replace(",", "."));
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  private findFeatureLabel(properties: Record<string, string>): string | null {
    return this.findPropertyValue(properties, (key) => LABEL_PROPERTY_ALIASES.has(key));
  }

  private findFeatureDescription(properties: Record<string, string>): string | null {
    return this.findPropertyValue(properties, (key) => DESCRIPTION_PROPERTY_ALIASES.has(key));
  }

  private findPropertyValue(
    properties: Record<string, string>,
    matcher: (normalizedKey: string) => boolean,
  ): string | null {
    for (const [key, value] of Object.entries(properties)) {
      if (!matcher(this.normalizeKey(key))) {
        continue;
      }

      if (value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private matchesKmKey(normalizedKey: string): boolean {
    return (
      KM_PROPERTY_ALIASES.has(normalizedKey) ||
      normalizedKey.startsWith("km_") ||
      normalizedKey.endsWith("_km") ||
      normalizedKey.includes("quilometr")
    );
  }

  private matchesMowingTypeKey(normalizedKey: string): boolean {
    return (
      MOWING_TYPE_PROPERTY_ALIASES.has(normalizedKey) ||
      (normalizedKey.includes("mowing") && normalizedKey.includes("type")) ||
      (normalizedKey.includes("tipo") && normalizedKey.includes("rocada"))
    );
  }

  private matchesRoadNameKey(normalizedKey: string): boolean {
    return (
      ROAD_NAME_PROPERTY_ALIASES.has(normalizedKey) ||
      normalizedKey.includes("rodovia") ||
      normalizedKey.includes("highway")
    );
  }

  private extractRoadNameFromText(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const match = value.match(/\b([A-Z]{2,3}-?\d{2,4})\b/i);
    return match?.[1]?.toUpperCase() ?? null;
  }

  private normalizePropertyValue(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    return null;
  }

  private toLineStringWkt(coordinates: Coordinate[]): string {
    return `LINESTRING(${coordinates
      .map(
        ([longitude, latitude]) =>
          `${this.formatCoordinate(longitude)} ${this.formatCoordinate(latitude)}`,
      )
      .join(", ")})`;
  }

  private toPolygonWkt(coordinates: Coordinate[]): string {
    return `POLYGON((${this.ensureClosedRing(coordinates)
      .map(
        ([longitude, latitude]) =>
          `${this.formatCoordinate(longitude)} ${this.formatCoordinate(latitude)}`,
      )
      .join(", ")}))`;
  }

  private ensureClosedRing(coordinates: Coordinate[]): Coordinate[] {
    if (coordinates.length === 0) {
      return coordinates;
    }

    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];

    if (first[0] === last[0] && first[1] === last[1]) {
      return coordinates;
    }

    return [...coordinates, first];
  }

  private toArray<T>(value: T | T[] | null | undefined): T[] {
    if (value === null || value === undefined) {
      return [];
    }

    return Array.isArray(value) ? value : [value];
  }

  private asRecord(value: unknown): JsonObject | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }

    return value as JsonObject;
  }

  private normalizeKey(key: string): string {
    return key
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  private formatCoordinate(value: number): string {
    return Number(value.toFixed(12)).toString();
  }

  private inferRoadNameFromFileName(fileName: string): string | null {
    return this.extractRoadNameFromText(this.fileLabel(fileName));
  }

  private fileLabel(fileName: string): string {
    return basename(fileName, extname(fileName)).replace(/[_-]+/g, " ").trim();
  }
}
