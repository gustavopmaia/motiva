import { DrizzleService } from "../../database/drizzle.service";
export type Transaction = Parameters<Parameters<DrizzleService["db"]["transaction"]>[0]>[0];
export type Database = DrizzleService["db"] | Transaction;
