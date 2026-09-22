import { AsyncLocalStorage } from "node:async_hooks";
export type OperationContext = { correlationId: string; causationId?: string };
export const operationContext = new AsyncLocalStorage<OperationContext>();
