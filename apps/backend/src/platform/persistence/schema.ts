import { sql } from "drizzle-orm";
import {
  check,
  index,
  bigint,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey(),
    queue: text("queue").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    schemaVersion: integer("schema_version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
  },
  (table) => ({
    attemptsCheck: check("outbox_events_attempts_check", sql`${table.attempts} >= 0`),
    pendingIndex: index("outbox_pending_idx")
      .on(table.availableAt, table.createdAt)
      .where(sql`${table.completedAt} IS NULL`),
  }),
);

export const outboxReplayAudit = pgTable("outbox_replay_audit", {
  id: uuid("id").primaryKey(),
  eventId: uuid("event_id").notNull(),
  actorId: text("actor_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ingestionRejections = pgTable("ingestion_rejections", {
  id: uuid("id").primaryKey(),
  topic: text("topic").notNull(),
  payload: text("payload").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const objectUploads = pgTable(
  "object_uploads",
  {
    namespace: text("namespace").notNull(),
    key: text("key").notNull(),
    sha256: text("sha256").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    state: text("state").default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    attachedAt: timestamp("attached_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.namespace, table.key] }),
    namespaceCheck: check(
      "object_uploads_namespace_check",
      sql`${table.namespace} IN ('vehicle-captures', 'work-order-photos')`,
    ),
    sizeCheck: check("object_uploads_size_bytes_check", sql`${table.sizeBytes} > 0`),
    stateCheck: check(
      "object_uploads_state_check",
      sql`${table.state} IN ('pending', 'attached', 'deleting', 'deleted')`,
    ),
    cleanupIndex: index("object_uploads_cleanup_idx")
      .on(table.createdAt)
      .where(sql`${table.state} IN ('pending', 'deleting')`),
  }),
);
