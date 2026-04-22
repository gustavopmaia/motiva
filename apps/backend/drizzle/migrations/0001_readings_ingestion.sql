CREATE TABLE "readings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"segment_id" uuid NOT NULL,
	"source" text NOT NULL,
	"height_cm" integer,
	"classification" text,
	"confidence" double precision NOT NULL,
	"score" double precision NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "road_segments" ADD COLUMN "score_current" double precision;--> statement-breakpoint
ALTER TABLE "road_segments" ADD COLUMN "score_divergent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "readings" ADD CONSTRAINT "readings_segment_id_road_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."road_segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "readings_segment_source_created_at_idx" ON "readings" USING btree ("segment_id","source","created_at");