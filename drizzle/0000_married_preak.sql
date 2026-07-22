CREATE TABLE "alternate_demand_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"alternate_demand_record_id" text NOT NULL,
	"exposure_record_id" text NOT NULL,
	"quantity_allocated" double precision NOT NULL,
	"allocated_at" text NOT NULL,
	"allocated_by" text NOT NULL,
	"status" text NOT NULL,
	"reversed_at" text,
	"reversed_by" text,
	"reversal_reason" text
);
--> statement-breakpoint
CREATE TABLE "alternate_demand_records" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"part_id" text NOT NULL,
	"demand_source_type" text NOT NULL,
	"demand_source_id" text,
	"affected_assembly_id" text,
	"quantity_available_for_offset" double precision NOT NULL,
	"demand_date" text,
	"source_reference" text,
	"source_file" text,
	"source_row" integer,
	"confidence" double precision NOT NULL,
	"review_status" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" text
);
--> statement-breakpoint
CREATE TABLE "audit_log_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"engineering_change_id" text,
	"entity_type" text,
	"entity_id" text,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"before_snapshot" text,
	"after_snapshot" text,
	"timestamp" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bom_diff_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"engineering_change_id" text NOT NULL,
	"part_id" text NOT NULL,
	"change_type" text NOT NULL,
	"from_quantity" double precision,
	"to_quantity" double precision,
	"replacement_part_id" text
);
--> statement-breakpoint
CREATE TABLE "bom_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"engineering_change_id" text NOT NULL,
	"version_label" text NOT NULL,
	"ingestion_mode" text NOT NULL,
	"source_file" text NOT NULL,
	"source_sheet" text NOT NULL,
	"imported_by" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bom_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"bom_import_id" text NOT NULL,
	"part_id" text,
	"raw_part_number" text NOT NULL,
	"raw_description" text NOT NULL,
	"quantity_per" double precision,
	"quantity_parse_status" text NOT NULL,
	"parent_bom_line_id" text,
	"source_row" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crosswalk_allocation_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"crosswalk_id" text NOT NULL,
	"method" text NOT NULL,
	"plant_code" text,
	"supplier_id" text,
	"fixed_quantity" double precision,
	"percentage" double precision,
	"notes" text,
	"effective_date" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engineering_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"status" text NOT NULL,
	"created_by" text NOT NULL,
	"target_effective_date" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rate_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"base_currency" text NOT NULL,
	"quote_currency" text NOT NULL,
	"rate" double precision NOT NULL,
	"rate_date" text NOT NULL,
	"source" text NOT NULL,
	"entered_by" text NOT NULL,
	"entered_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exposure_records" (
	"id" text PRIMARY KEY NOT NULL,
	"engineering_change_id" text NOT NULL,
	"part_id" text NOT NULL,
	"purchase_order_line_id" text NOT NULL,
	"exposure_source_snapshot_id" text NOT NULL,
	"gross_committed_value_transaction" double precision NOT NULL,
	"gross_committed_value_reporting" double precision NOT NULL,
	"alternate_demand_adjustment_transaction" double precision NOT NULL,
	"alternate_demand_adjustment_reporting" double precision NOT NULL,
	"net_exposure_value_transaction" double precision NOT NULL,
	"net_exposure_value_reporting" double precision NOT NULL,
	"confidence_classification" text NOT NULL,
	"cancellation_status" text NOT NULL,
	"cancellation_confidence" text NOT NULL,
	"formula_version" text NOT NULL,
	"calculated_at" text NOT NULL,
	"classification_reason" text,
	"superseded_by_id" text
);
--> statement-breakpoint
CREATE TABLE "exposure_source_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"engineering_change_id" text NOT NULL,
	"bom_diff_entry_id" text NOT NULL,
	"purchase_order_id" text NOT NULL,
	"purchase_order_line_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"raw_part_id" text NOT NULL,
	"normalized_part_id" text NOT NULL,
	"quantity_open" double precision,
	"unit_price_transaction_currency" double precision,
	"transaction_currency" text NOT NULL,
	"reporting_currency" text NOT NULL,
	"exchange_rate" double precision NOT NULL,
	"exchange_rate_date" text NOT NULL,
	"exchange_rate_snapshot_id" text,
	"promised_receipt_date" text,
	"line_status" text NOT NULL,
	"supplier_terms_version_id" text,
	"crosswalk_version_id" text NOT NULL,
	"alternate_demand_allocation_ids" text NOT NULL,
	"source_files" text NOT NULL,
	"source_rows" text NOT NULL,
	"calculated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_outcomes" (
	"id" text PRIMARY KEY NOT NULL,
	"exposure_record_id" text NOT NULL,
	"frozen_unit_price" double precision NOT NULL,
	"quantity_cancelled" double precision NOT NULL,
	"quantity_redirected" double precision NOT NULL,
	"quantity_received_before_action" double precision NOT NULL,
	"recoverable_unit_value" double precision,
	"recoverable_unit_value_basis" text,
	"recoverable_unit_value_justification_note" text,
	"recoverable_unit_value_reviewed_by" text,
	"cancellation_fee" double precision NOT NULL,
	"supplier_credit_value" double precision NOT NULL,
	"write_off_value" double precision NOT NULL,
	"rework_cost" double precision,
	"disposal_cost" double precision,
	"gross_cancelled_commitment_value" double precision NOT NULL,
	"cancelled_commitment_avoidance" double precision NOT NULL,
	"redirected_value_preserved" double precision NOT NULL,
	"actual_cost_avoided" double precision NOT NULL,
	"actual_realized_loss" double precision NOT NULL,
	"estimated_cost_avoided_frozen" double precision NOT NULL,
	"outcome_exchange_rate_snapshot_id" text,
	"closed_at" text,
	"closed_by" text
);
--> statement-breakpoint
CREATE TABLE "mitigation_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"exposure_record_id" text NOT NULL,
	"action_type" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"due_date" text,
	"status" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "part_number_crosswalks" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plm_part_id" text NOT NULL,
	"erp_part_id" text NOT NULL,
	"match_method" text NOT NULL,
	"confidence" double precision NOT NULL,
	"match_evidence" text,
	"review_status" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" text,
	"effective_date" text NOT NULL,
	"notes" text,
	"mapping_type" text NOT NULL,
	"superseded_by_id" text
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"purchase_order_id" text NOT NULL,
	"part_id" text,
	"raw_part_number" text NOT NULL,
	"quantity_open" double precision,
	"quantity_parse_status" text NOT NULL,
	"transaction_currency" text NOT NULL,
	"unit_price_transaction_currency" double precision,
	"price_parse_status" text NOT NULL,
	"promised_receipt_date" text,
	"line_status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"engineering_change_id" text,
	"po_number" text NOT NULL,
	"supplier_id" text NOT NULL,
	"source_file" text NOT NULL,
	"imported_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_commitment_terms" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"part_id" text,
	"ncnr" boolean NOT NULL,
	"standard_lead_time_days" integer,
	"cancellation_window_days" integer,
	"source" text NOT NULL,
	"effective_date" text NOT NULL,
	"notes" text,
	"verified_at" text,
	"verified_by" text,
	"valid_until" text,
	"superseded_by_id" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"mitigation_action_id" text NOT NULL,
	"response_type" text NOT NULL,
	"quantity_cancelled" double precision NOT NULL,
	"quantity_redirected" double precision NOT NULL,
	"quantity_received_before_action" double precision NOT NULL,
	"responded_at" text NOT NULL,
	"recorded_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"erp_supplier_id" text,
	"default_cancellation_terms_notes" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alternate_demand_allocations" ADD CONSTRAINT "alternate_demand_allocations_alternate_demand_record_id_alternate_demand_records_id_fk" FOREIGN KEY ("alternate_demand_record_id") REFERENCES "public"."alternate_demand_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alternate_demand_records" ADD CONSTRAINT "alternate_demand_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log_entries" ADD CONSTRAINT "audit_log_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_diff_entries" ADD CONSTRAINT "bom_diff_entries_engineering_change_id_engineering_changes_id_fk" FOREIGN KEY ("engineering_change_id") REFERENCES "public"."engineering_changes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_imports" ADD CONSTRAINT "bom_imports_engineering_change_id_engineering_changes_id_fk" FOREIGN KEY ("engineering_change_id") REFERENCES "public"."engineering_changes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_bom_import_id_bom_imports_id_fk" FOREIGN KEY ("bom_import_id") REFERENCES "public"."bom_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crosswalk_allocation_rules" ADD CONSTRAINT "crosswalk_allocation_rules_crosswalk_id_part_number_crosswalks_id_fk" FOREIGN KEY ("crosswalk_id") REFERENCES "public"."part_number_crosswalks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_changes" ADD CONSTRAINT "engineering_changes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rate_snapshots" ADD CONSTRAINT "exchange_rate_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exposure_records" ADD CONSTRAINT "exposure_records_engineering_change_id_engineering_changes_id_fk" FOREIGN KEY ("engineering_change_id") REFERENCES "public"."engineering_changes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exposure_records" ADD CONSTRAINT "exposure_records_exposure_source_snapshot_id_exposure_source_snapshots_id_fk" FOREIGN KEY ("exposure_source_snapshot_id") REFERENCES "public"."exposure_source_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exposure_source_snapshots" ADD CONSTRAINT "exposure_source_snapshots_engineering_change_id_engineering_changes_id_fk" FOREIGN KEY ("engineering_change_id") REFERENCES "public"."engineering_changes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_outcomes" ADD CONSTRAINT "financial_outcomes_exposure_record_id_exposure_records_id_fk" FOREIGN KEY ("exposure_record_id") REFERENCES "public"."exposure_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mitigation_actions" ADD CONSTRAINT "mitigation_actions_exposure_record_id_exposure_records_id_fk" FOREIGN KEY ("exposure_record_id") REFERENCES "public"."exposure_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_number_crosswalks" ADD CONSTRAINT "part_number_crosswalks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_engineering_change_id_engineering_changes_id_fk" FOREIGN KEY ("engineering_change_id") REFERENCES "public"."engineering_changes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_commitment_terms" ADD CONSTRAINT "supplier_commitment_terms_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_responses" ADD CONSTRAINT "supplier_responses_mitigation_action_id_mitigation_actions_id_fk" FOREIGN KEY ("mitigation_action_id") REFERENCES "public"."mitigation_actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;