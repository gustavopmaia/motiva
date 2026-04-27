CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"segment_id" uuid NOT NULL,
	"os_id" text,
	"level" text NOT NULL,
	"score" double precision NOT NULL,
	"channels" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'field' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_segment_id_road_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."road_segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_segment_level_idx" ON "alerts" USING btree ("segment_id","level");