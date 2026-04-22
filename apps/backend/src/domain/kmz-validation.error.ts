export class KmzValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KmzValidationError";
  }
}
