export type ApiKeySource = "iot" | "vehicle" | "satellite";

export type ApiKey = {
  id: string;
  name: string;
  source: ApiKeySource;
  key: string;
  createdAt: Date;
};
