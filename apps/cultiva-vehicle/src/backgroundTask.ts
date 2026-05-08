import BackgroundService from "react-native-background-actions";
import Geolocation from "react-native-geolocation-service";
import { captureState } from "./captureState";
import { postReading } from "./api";
import { enqueue, dequeueFirst, requeueFront } from "./queue";
import type { ReadingPayload } from "./types";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const CAPTURE_INTERVAL_MS = 10_000;
const RETRY_COOLDOWN_MS = 30_000;

// Timestamp after which we are allowed to attempt network sends again.
// Reset to 0 on success, set to now+30s on failure.
let retryAfter = 0;

function getGPS(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      // Low-accuracy (coarse) mode: faster, less battery, good enough for a vehicle route.
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5000 },
    );
  });
}

// Drain the queue oldest-first. Returns false if any item fails to send.
async function drainQueue(): Promise<boolean> {
  while (true) {
    const item = await dequeueFirst();
    if (!item) return true;

    try {
      await postReading(item);
    } catch {
      await requeueFront(item);
      return false;
    }
  }
}

async function captureAndSend(): Promise<void> {
  const captureFn = captureState.captureFn;
  if (!captureFn) return;

  // Capture and GPS can run concurrently — camera warm-up takes ~1s anyway.
  const [imageBase64, coords] = await Promise.all([captureFn(), getGPS()]);
  captureState.currentCoords = coords;

  const payload: ReadingPayload = {
    source: "vehicle",
    imageBase64,
    lat: coords.lat,
    lon: coords.lon,
    timestamp: new Date().toISOString(),
    vehicleId: captureState.vehicleId,
  };

  // Respect the 30-second retry cooldown after a previous failure.
  if (Date.now() < retryAfter) {
    captureState.currentStatus = "offline";
    await enqueue(payload);
    return;
  }

  const drained = await drainQueue();

  if (drained) {
    captureState.currentStatus = "capturing";
    try {
      await postReading(payload);
      retryAfter = 0;
    } catch {
      captureState.currentStatus = "offline";
      await enqueue(payload);
      retryAfter = Date.now() + RETRY_COOLDOWN_MS;
    }
  } else {
    captureState.currentStatus = "offline";
    await enqueue(payload);
    retryAfter = Date.now() + RETRY_COOLDOWN_MS;
  }
}

export const backgroundTask = async (_taskData?: unknown): Promise<void> => {
  await new Promise<void>(async (resolve) => {
    while (BackgroundService.isRunning()) {
      try {
        await captureAndSend();
      } catch (err) {
        console.warn("[cultiva-vehicle] capture error:", err);
        captureState.currentStatus = "offline";
      }
      await sleep(CAPTURE_INTERVAL_MS);
    }
    resolve();
  });
};

export const backgroundOptions = {
  taskName: "CultivaCapture",
  taskTitle: "Cultiva Vehicle",
  taskDesc: "Capturing route images",
  taskIcon: { name: "ic_launcher", type: "mipmap" },
  color: "#2E7D32",
  linkingURI: "cultivavehicle://",
  parameters: {},
};
