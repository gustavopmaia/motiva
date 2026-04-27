export type ApiKeySource = "iot" | "vehicle" | "satellite";

export class ApiKey {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly source: ApiKeySource,
    public readonly key: string,
    public readonly createdAt: Date = new Date(),
  ) {}
}
