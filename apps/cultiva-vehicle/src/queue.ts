import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ReadingPayload } from "./types";

const QUEUE_KEY = "cultiva_vehicle_queue";
const MAX_QUEUE_SIZE = 50;

async function load(): Promise<ReadingPayload[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as ReadingPayload[]) : [];
}

async function save(queue: ReadingPayload[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

// Adds payload to the back of the queue. If the queue is already at capacity,
// the oldest item (front) is dropped so we never grow unbounded.
export async function enqueue(payload: ReadingPayload): Promise<void> {
  const queue = await load();
  if (queue.length >= MAX_QUEUE_SIZE) {
    queue.shift(); // drop oldest
  }
  queue.push(payload);
  await save(queue);
}

export async function dequeueFirst(): Promise<ReadingPayload | null> {
  const queue = await load();
  if (queue.length === 0) return null;
  const [first, ...rest] = queue;
  await save(rest);
  return first;
}

// Put an item back at the front when a send attempt failed, preserving order.
export async function requeueFront(payload: ReadingPayload): Promise<void> {
  const queue = await load();
  await save([payload, ...queue]);
}

export async function queueSize(): Promise<number> {
  const queue = await load();
  return queue.length;
}
