import type { AppStatus } from './types';

// Mutable module-level state shared between the React component and the
// background task. Both run on the same JS thread so no locking is needed.
export const captureState = {
  // Registered by App.tsx. Opens the camera, captures one frame, closes the
  // camera, and returns the base64-encoded JPEG string.
  captureFn: null as (() => Promise<string>) | null,
  vehicleId: '',
  currentStatus: 'idle' as AppStatus,
  currentCoords: null as { lat: number; lon: number } | null,
};
