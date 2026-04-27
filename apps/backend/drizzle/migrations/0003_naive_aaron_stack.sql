CREATE TABLE "work_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"segment_id" uuid NOT NULL,
	"alert_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text NOT NULL,
	"score_at_creation" double precision NOT NULL,
	"team" text,
	"observation" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_segment_id_road_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."road_segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_orders_status_idx" ON "work_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "work_orders_segment_idx" ON "work_orders" USING btree ("segment_id");