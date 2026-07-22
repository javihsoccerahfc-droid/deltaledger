ALTER TABLE "exposure_source_snapshots" ADD COLUMN "crosswalk_erp_part_id" text;--> statement-breakpoint
ALTER TABLE "exposure_source_snapshots" ADD COLUMN "crosswalk_match_method" text;--> statement-breakpoint
ALTER TABLE "exposure_source_snapshots" ADD COLUMN "crosswalk_review_status" text;--> statement-breakpoint
ALTER TABLE "exposure_source_snapshots" ADD COLUMN "crosswalk_reviewed_by" text;--> statement-breakpoint
ALTER TABLE "exposure_source_snapshots" ADD COLUMN "crosswalk_reviewed_at" text;--> statement-breakpoint
ALTER TABLE "exposure_source_snapshots" ADD COLUMN "allocation_method" text;