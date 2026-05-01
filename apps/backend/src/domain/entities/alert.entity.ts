export type AlertLevel = "attention" | "urgent" | "critical";

export type Alert = {
  id: string;
  segmentId: string;
  osId: string | null;
  level: AlertLevel;
  score: number;
  channels: Record<string, unknown>;
  createdAt: Date;
  closedAt: Date | null;
};
