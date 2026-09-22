import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../../identity/infrastructure/schema";

export const generatedReports = pgTable(
  "generated_reports",
  {
    id: uuid("id").primaryKey(),
    reportType: text("report_type").notNull(),
    period: text("period").notNull(),
    format: text("format").notNull(),
    roadName: text("road_name"),
    generatedBy: uuid("generated_by")
      .notNull()
      .references(() => users.id),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
  },
  (table) => ({
    generatedReportsTypePeriodIdx: index("generated_reports_type_period_idx").on(
      table.reportType,
      table.period,
    ),
  }),
);
