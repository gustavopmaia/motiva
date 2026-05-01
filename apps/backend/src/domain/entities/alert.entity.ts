export type AlertLevel = "attention" | "urgent" | "critical";

export class Alert {
  constructor(
    public readonly id: string,
    public readonly segmentId: string,
    public readonly osId: string | null,
    public readonly level: AlertLevel,
    public readonly score: number,
    public readonly channels: Record<string, unknown>,
    public readonly createdAt: Date = new Date(),
    public readonly closedAt: Date | null = null,
  ) {}
}
