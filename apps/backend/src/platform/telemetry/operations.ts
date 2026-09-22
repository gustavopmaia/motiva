import { Counter, Histogram } from "prom-client";
export const transactionRetries = new Counter({
  name: "database_transaction_retries_total",
  help: "Retried transactions by bounded PostgreSQL error code",
  labelNames: ["code"],
});
const operations = new Counter({
  name: "backend_operations_total",
  help: "External operations by outcome",
  labelNames: ["operation", "outcome"],
});
const duration = new Histogram({
  name: "backend_operation_duration_seconds",
  help: "External operation duration including failed attempts",
  labelNames: ["operation"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 15, 30],
});
type Operation = "storage.put" | "storage.get" | "storage.delete" | "classifier.classify";
export async function measured<T>(operation: Operation, action: () => Promise<T>): Promise<T> {
  const stop = duration.startTimer({ operation });
  try {
    const result = await action();
    operations.inc({ operation, outcome: "success" });
    return result;
  } catch (error) {
    operations.inc({ operation, outcome: "failure" });
    throw error;
  } finally {
    stop();
  }
}
