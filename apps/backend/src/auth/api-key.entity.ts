export const API_KEY_SOURCES = ["iot", "vehicle", "satellite"] as const;

export type ApiKeySource = (typeof API_KEY_SOURCES)[number];

export type ApiKeyRequest = {
  headers: Record<string, unknown>;
  apiKeySource: ApiKeySource;
};

export type ApiKey = {
  id: string;
  name: string;
  source: ApiKeySource;
  key: string;
  createdAt: Date;
};
