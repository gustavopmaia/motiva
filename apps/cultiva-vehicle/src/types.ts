export interface ReadingPayload {
  source: 'vehicle';
  imageBase64: string;
  lat: number;
  lon: number;
  timestamp: string;
  vehicleId: string;
}

export type AppStatus = 'idle' | 'capturing' | 'offline' | 'syncing';
