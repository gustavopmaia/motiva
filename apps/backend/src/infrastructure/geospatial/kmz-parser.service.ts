import { Injectable } from "@nestjs/common";
import { XMLParser } from "fast-xml-parser";
import AdmZip from "adm-zip";
import { basename, extname } from "path";
import { KmzValidationError } from "@domain/kmz-validation.error";

type Coordinate = [number, number];
type KmlNode = Record<string, unknown>;
type KmzEntry = {
  isDirectory: boolean;
  entryName: string;
  getData(): Buffer;
};

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

@Injectable()
export class KmzParserService {
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    removeNSPrefix: true,
    trimValues: true,
    parseTagValue: false,
    parseAttributeValue: false,
  });

  async parseMarkers(buffer: Buffer, fileName: string): Promise<ParsedKmMarker[]> {
    const parsedDocument = await this.parseDocument(buffer, fileName);
    const fallbackRoadName =
      this.extractDocumentName(parsedDocument) ?? this.extractFallbackRoadName(fileName);

    return this.findNodesByKey(parsedDocument, "Placemark")
      .map((placemark) => this.parseMarkerPlacemark(placemark, fallbackRoadName))
      .filter((marker): marker is ParsedKmMarker => marker !== null);
  }

  async parseMowingFeatures(buffer: Buffer, fileName: string): Promise<ParsedMowingFeature[]> {
    const parsedDocument = await this.parseDocument(buffer, fileName);
    const fallbackRoadName = this.extractDocumentName(parsedDocument);

    return this.findNodesByKey(parsedDocument, "Placemark").flatMap((placemark) =>
      this.parseMowingPlacemark(placemark, fallbackRoadName),
    );
  }

  private async parseDocument(buffer: Buffer, fileName: string) {
    const kmlContent = await this.extractKmlContent(buffer, fileName);
    return this.xmlParser.parse(kmlContent);
  }

  private async extractKmlContent(buffer: Buffer, fileName: string): Promise<string> {
    const extension = extname(fileName).toLowerCase();

    if (extension !== ".kmz") {
      throw new KmzValidationError("Only KMZ files are supported.");
    }

    const archive = new AdmZip(buffer);
    const kmlEntry = (archive.getEntries() as KmzEntry[])
      .filter(
        (entry: KmzEntry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith(".kml"),
      )
      .sort((left: KmzEntry, right: KmzEntry) => {
        if (left.entryName.toLowerCase() === "doc.kml") return -1;
        if (right.entryName.toLowerCase() === "doc.kml") return 1;
        return left.entryName.localeCompare(right.entryName);
      })[0];

    if (!kmlEntry) {
      throw new KmzValidationError("KMZ archive does not contain a KML file.");
    }

    return kmlEntry.getData().toString("utf8");
  }

  private parseMarkerPlacemark(node: unknown, fallbackRoadName: string): ParsedKmMarker | null {
    const placemark = this.asRecord(node);

    if (!placemark) {
      return null;
    }

    const point = this.extractPointCoordinate(placemark);
    if (!point) {
      return null;
    }

    const properties = this.extractProperties(placemark);
    const label = this.firstNonEmpty([
      this.toNullableString(placemark.name),
      properties.name ?? null,
    ]);
    const km = this.extractKmValue(properties, label);

    if (km === null) {
      return null;
    }

    const roadName =
      this.extractRoadName(properties, label) ??
      this.extractRoadNameFromLabel(label) ??
      fallbackRoadName;

    return {
      roadName,
      km,
      coordinate: point,
    };
  }

  private parseMowingPlacemark(
    node: unknown,
    fallbackRoadName: string | null,
  ): ParsedMowingFeature[] {
    const placemark = this.asRecord(node);

    if (!placemark) {
      return [];
    }

    const properties = this.extractProperties(placemark);
    const label = this.firstNonEmpty([
      this.toNullableString(placemark.name),
      properties.name ?? null,
    ]);
    const mowingType =
      this.findPropertyValue(properties, (key) => this.matchesMowingTypeKey(key)) ??
      this.extractMowingTypeFromLabel(label);

    if (!mowingType) {
      return [];
    }

    const roadName =
      this.extractRoadName(properties, label) ??
      this.extractRoadNameFromLabel(label) ??
      fallbackRoadName;

    return this.extractGeometryWkts(placemark).map((geometryWkt) => ({
      roadName,
      mowingType,
      geometryWkt,
    }));
  }

  private extractProperties(placemark: KmlNode): Record<string, string> {
    const properties: Record<string, string> = {};

    const name = this.toNullableString(placemark.name);
    if (name) {
      properties.name = name;
    }

    const description = this.toNullableString(placemark.description);
    if (description) {
      properties.description = description;
      Object.assign(properties, this.extractDescriptionProperties(description));
    }

    this.extractExtendedData(placemark.ExtendedData, properties);

    return properties;
  }

  private extractDescriptionProperties(description: string): Record<string, string> {
    const properties: Record<string, string> = {};
    const normalizedDescription = description.replace(/<br\s*\/?>/gi, "\n");
    const cleanedDescription = normalizedDescription.replace(/<[^>]+>/g, " ");

    for (const line of cleanedDescription.split("\n")) {
      const [rawKey, ...rawValueParts] = line.split(":");
      const key = rawKey?.trim();
      const value = rawValueParts.join(":").trim();

      if (!key || !value) {
        continue;
      }

      properties[key] = value;
    }

    return properties;
  }

  private extractExtendedData(node: unknown, properties: Record<string, string>): void {
    const extendedData = this.asRecord(node);

    if (!extendedData) {
      return;
    }

    for (const dataNode of this.toArray(extendedData.Data)) {
      const dataRecord = this.asRecord(dataNode);
      const key = this.toNullableString(dataRecord?.name);
      const value = this.normalizePropertyValue(dataRecord?.value);

      if (key && value) {
        properties[key] = value;
      }
    }

    for (const schemaNode of this.toArray(extendedData.SchemaData)) {
      const schemaRecord = this.asRecord(schemaNode);

      if (!schemaRecord) {
        continue;
      }

      for (const simpleDataNode of this.toArray(schemaRecord.SimpleData)) {
        const simpleDataRecord = this.asRecord(simpleDataNode);
        const key = this.toNullableString(simpleDataRecord?.name);
        const value = this.normalizePropertyValue(
          simpleDataRecord?.value ?? simpleDataRecord?.["#text"],
        );

        if (key && value) {
          properties[key] = value;
        }
      }
    }
  }

  private extractPointCoordinate(placemark: KmlNode): Coordinate | null {
    const pointNode = this.findNodesByKey(placemark, "Point")[0];
    const pointRecord = this.asRecord(pointNode);
    const coordinates = this.parseCoordinates(pointRecord?.coordinates);

    return coordinates[0] ?? null;
  }

  private extractGeometryWkts(placemark: KmlNode): string[] {
    const lineStrings = this.findNodesByKey(placemark, "LineString")
      .map((lineNode) => this.asRecord(lineNode))
      .map((lineRecord) => this.parseCoordinates(lineRecord?.coordinates))
      .filter((coordinates) => coordinates.length >= 2)
      .map((coordinates) => this.toLineStringWkt(coordinates));

    const polygons = this.findNodesByKey(placemark, "Polygon")
      .map((polygonNode) => this.asRecord(polygonNode))
      .map((polygonRecord) => this.extractPolygonCoordinates(polygonRecord))
      .filter((coordinates) => coordinates.length >= 4)
      .map((coordinates) => this.toPolygonWkt(coordinates));

    return [...lineStrings, ...polygons];
  }

  private extractPolygonCoordinates(polygon: KmlNode | null): Coordinate[] {
    const outerBoundary = this.asRecord(polygon?.outerBoundaryIs);
    const linearRing = this.asRecord(outerBoundary?.LinearRing);
    return this.parseCoordinates(linearRing?.coordinates);
  }

  private extractKmValue(properties: Record<string, string>, label: string | null): number | null {
    const propertyValue = this.findPropertyValue(properties, (key) => this.matchesKmKey(key));

    return this.parseKmNumber(propertyValue) ?? this.parseKmNumber(label);
  }

  private extractRoadName(properties: Record<string, string>, label: string | null): string | null {
    return (
      this.findPropertyValue(properties, (key) => this.matchesRoadNameKey(key)) ??
      this.extractRoadNameFromLabel(label)
    );
  }

  private extractMowingTypeFromLabel(label: string | null): string | null {
    if (!label) {
      return null;
    }

    const trimmed = label.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private extractRoadNameFromLabel(label: string | null): string | null {
    if (!label) {
      return null;
    }

    const match = label.match(/\b([A-Z]{2,3}-?\d{2,4})\b/i);
    return match?.[1]?.toUpperCase() ?? null;
  }

  private extractDocumentName(document: unknown): string | null {
    const documentNode = this.findNodesByKey(document, "Document")[0];
    const folderNode = this.findNodesByKey(document, "Folder")[0];
    const record = this.asRecord(documentNode) ?? this.asRecord(folderNode);
    return this.toNullableString(record?.name);
  }

  private extractFallbackRoadName(fileName: string): string {
    return basename(fileName, extname(fileName)).replace(/[_-]+/g, " ").trim();
  }

  private parseKmNumber(value: string | null): number | null {
    if (!value) {
      return null;
    }

    const match = value.match(/(?:\bkm\b\D*)?(\d+(?:[.,]\d+)?)/i);
    if (!match) {
      return null;
    }

    const parsedValue = Number.parseFloat(match[1].replace(",", "."));
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  private parseCoordinates(value: unknown): Coordinate[] {
    const rawCoordinates = this.toNullableString(value);

    if (!rawCoordinates) {
      return [];
    }

    return rawCoordinates
      .trim()
      .split(/\s+/)
      .map((entry) => {
        const [longitude, latitude] = entry.split(",");
        const x = Number.parseFloat(longitude ?? "");
        const y = Number.parseFloat(latitude ?? "");

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return null;
        }

        return [x, y] as Coordinate;
      })
      .filter((coordinate): coordinate is Coordinate => coordinate !== null);
  }

  private toLineStringWkt(coordinates: Coordinate[]): string {
    return `LINESTRING(${coordinates
      .map(([longitude, latitude]) => {
        return `${this.formatCoordinate(longitude)} ${this.formatCoordinate(latitude)}`;
      })
      .join(", ")})`;
  }

  private toPolygonWkt(coordinates: Coordinate[]): string {
    const ring = this.ensureClosedRing(coordinates)
      .map(([longitude, latitude]) => {
        return `${this.formatCoordinate(longitude)} ${this.formatCoordinate(latitude)}`;
      })
      .join(", ");

    return `POLYGON((${ring}))`;
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

  private findPropertyValue(
    properties: Record<string, string>,
    matcher: (normalizedKey: string) => boolean,
  ): string | null {
    for (const [key, value] of Object.entries(properties)) {
      if (!matcher(this.normalizeKey(key))) {
        continue;
      }

      const normalizedValue = this.toNullableString(value);
      if (normalizedValue) {
        return normalizedValue;
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

  private findNodesByKey(node: unknown, key: string): unknown[] {
    if (Array.isArray(node)) {
      return node.flatMap((entry) => this.findNodesByKey(entry, key));
    }

    const record = this.asRecord(node);
    if (!record) {
      return [];
    }

    const matches: unknown[] = [];

    for (const [entryKey, entryValue] of Object.entries(record)) {
      if (entryKey === key) {
        matches.push(...this.toArray(entryValue));
      }

      matches.push(...this.findNodesByKey(entryValue, key));
    }

    return matches;
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

    if (Array.isArray(value)) {
      const joinedValue = value
        .map((entry) => this.normalizePropertyValue(entry))
        .filter((entry): entry is string => entry !== null)
        .join(" ");

      return joinedValue.length > 0 ? joinedValue : null;
    }

    if (typeof value === "object") {
      return this.normalizePropertyValue((value as KmlNode)["#text"]);
    }

    return null;
  }

  private toArray<T>(value: T | T[] | null | undefined): T[] {
    if (value === null || value === undefined) {
      return [];
    }

    return Array.isArray(value) ? value : [value];
  }

  private asRecord(value: unknown): KmlNode | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }

    return value as KmlNode;
  }

  private toNullableString(value: unknown): string | null {
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

    if (typeof value === "object" && value !== null && "#text" in value) {
      return this.toNullableString((value as KmlNode)["#text"]);
    }

    return null;
  }

  private firstNonEmpty(values: Array<string | null>): string | null {
    return values.find((value) => value !== null && value.trim().length > 0) ?? null;
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
}
