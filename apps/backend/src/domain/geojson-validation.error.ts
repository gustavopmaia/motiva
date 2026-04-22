export class GeoJsonValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeoJsonValidationError";
  }
}
