CREATE TABLE `alternate_demand_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`alternate_demand_record_id` text NOT NULL,
	`exposure_record_id` text NOT NULL,
	`quantity_allocated` real NOT NULL,
	`allocated_at` text NOT NULL,
	`allocated_by` text NOT NULL,
	`status` text NOT NULL,
	`reversed_at` text,
	`reversed_by` text,
	`reversal_reason` text,
	FOREIGN KEY (`alternate_demand_record_id`) REFERENCES `alternate_demand_records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `alternate_demand_records` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`part_id` text NOT NULL,
	`demand_source_type` text NOT NULL,
	`demand_source_id` text,
	`affected_assembly_id` text,
	`quantity_available_for_offset` real NOT NULL,
	`demand_date` text,
	`source_reference` text,
	`source_file` text,
	`source_row` integer,
	`confidence` real NOT NULL,
	`review_status` text NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_log_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`engineering_change_id` text,
	`entity_type` text,
	`entity_id` text,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`before_snapshot` text,
	`after_snapshot` text,
	`timestamp` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bom_diff_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`engineering_change_id` text NOT NULL,
	`part_id` text NOT NULL,
	`change_type` text NOT NULL,
	`from_quantity` real,
	`to_quantity` real,
	`replacement_part_id` text,
	FOREIGN KEY (`engineering_change_id`) REFERENCES `engineering_changes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bom_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`engineering_change_id` text NOT NULL,
	`version_label` text NOT NULL,
	`ingestion_mode` text NOT NULL,
	`source_file` text NOT NULL,
	`source_sheet` text NOT NULL,
	`imported_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`engineering_change_id`) REFERENCES `engineering_changes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bom_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`bom_import_id` text NOT NULL,
	`part_id` text,
	`raw_part_number` text NOT NULL,
	`raw_description` text NOT NULL,
	`quantity_per` real,
	`quantity_parse_status` text NOT NULL,
	`parent_bom_line_id` text,
	`source_row` integer NOT NULL,
	FOREIGN KEY (`bom_import_id`) REFERENCES `bom_imports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crosswalk_allocation_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`crosswalk_id` text NOT NULL,
	`method` text NOT NULL,
	`plant_code` text,
	`supplier_id` text,
	`fixed_quantity` real,
	`percentage` real,
	`notes` text,
	`effective_date` text NOT NULL,
	FOREIGN KEY (`crosswalk_id`) REFERENCES `part_number_crosswalks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `engineering_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`target_effective_date` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exchange_rate_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`base_currency` text NOT NULL,
	`quote_currency` text NOT NULL,
	`rate` real NOT NULL,
	`rate_date` text NOT NULL,
	`source` text NOT NULL,
	`entered_by` text NOT NULL,
	`entered_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exposure_records` (
	`id` text PRIMARY KEY NOT NULL,
	`engineering_change_id` text NOT NULL,
	`part_id` text NOT NULL,
	`purchase_order_line_id` text NOT NULL,
	`exposure_source_snapshot_id` text NOT NULL,
	`gross_committed_value_transaction` real NOT NULL,
	`gross_committed_value_reporting` real NOT NULL,
	`alternate_demand_adjustment_transaction` real NOT NULL,
	`alternate_demand_adjustment_reporting` real NOT NULL,
	`net_exposure_value_transaction` real NOT NULL,
	`net_exposure_value_reporting` real NOT NULL,
	`confidence_classification` text NOT NULL,
	`cancellation_status` text NOT NULL,
	`cancellation_confidence` text NOT NULL,
	`formula_version` text NOT NULL,
	`calculated_at` text NOT NULL,
	`classification_reason` text,
	`superseded_by_id` text,
	FOREIGN KEY (`engineering_change_id`) REFERENCES `engineering_changes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exposure_source_snapshot_id`) REFERENCES `exposure_source_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exposure_source_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`engineering_change_id` text NOT NULL,
	`bom_diff_entry_id` text NOT NULL,
	`purchase_order_id` text NOT NULL,
	`purchase_order_line_id` text NOT NULL,
	`supplier_id` text NOT NULL,
	`raw_part_id` text NOT NULL,
	`normalized_part_id` text NOT NULL,
	`quantity_open` real,
	`unit_price_transaction_currency` real,
	`transaction_currency` text NOT NULL,
	`reporting_currency` text NOT NULL,
	`exchange_rate` real NOT NULL,
	`exchange_rate_date` text NOT NULL,
	`exchange_rate_snapshot_id` text,
	`promised_receipt_date` text,
	`line_status` text NOT NULL,
	`supplier_terms_version_id` text,
	`crosswalk_version_id` text NOT NULL,
	`alternate_demand_allocation_ids` text NOT NULL,
	`source_files` text NOT NULL,
	`source_rows` text NOT NULL,
	`calculated_at` text NOT NULL,
	FOREIGN KEY (`engineering_change_id`) REFERENCES `engineering_changes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `financial_outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`exposure_record_id` text NOT NULL,
	`frozen_unit_price` real NOT NULL,
	`quantity_cancelled` real NOT NULL,
	`quantity_redirected` real NOT NULL,
	`quantity_received_before_action` real NOT NULL,
	`recoverable_unit_value` real,
	`recoverable_unit_value_basis` text,
	`recoverable_unit_value_justification_note` text,
	`recoverable_unit_value_reviewed_by` text,
	`cancellation_fee` real NOT NULL,
	`supplier_credit_value` real NOT NULL,
	`write_off_value` real NOT NULL,
	`rework_cost` real,
	`disposal_cost` real,
	`gross_cancelled_commitment_value` real NOT NULL,
	`cancelled_commitment_avoidance` real NOT NULL,
	`redirected_value_preserved` real NOT NULL,
	`actual_cost_avoided` real NOT NULL,
	`actual_realized_loss` real NOT NULL,
	`estimated_cost_avoided_frozen` real NOT NULL,
	`outcome_exchange_rate_snapshot_id` text,
	`closed_at` text,
	`closed_by` text,
	FOREIGN KEY (`exposure_record_id`) REFERENCES `exposure_records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mitigation_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`exposure_record_id` text NOT NULL,
	`action_type` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`due_date` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`exposure_record_id`) REFERENCES `exposure_records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `part_number_crosswalks` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`plm_part_id` text NOT NULL,
	`erp_part_id` text NOT NULL,
	`match_method` text NOT NULL,
	`confidence` real NOT NULL,
	`match_evidence` text,
	`review_status` text NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`effective_date` text NOT NULL,
	`notes` text,
	`mapping_type` text NOT NULL,
	`superseded_by_id` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `purchase_order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_order_id` text NOT NULL,
	`part_id` text,
	`raw_part_number` text NOT NULL,
	`quantity_open` real,
	`quantity_parse_status` text NOT NULL,
	`transaction_currency` text NOT NULL,
	`unit_price_transaction_currency` real,
	`price_parse_status` text NOT NULL,
	`promised_receipt_date` text,
	`line_status` text NOT NULL,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`engineering_change_id` text,
	`po_number` text NOT NULL,
	`supplier_id` text NOT NULL,
	`source_file` text NOT NULL,
	`imported_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engineering_change_id`) REFERENCES `engineering_changes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `supplier_commitment_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`part_id` text,
	`ncnr` integer NOT NULL,
	`standard_lead_time_days` integer,
	`cancellation_window_days` integer,
	`source` text NOT NULL,
	`effective_date` text NOT NULL,
	`notes` text,
	`verified_at` text,
	`verified_by` text,
	`valid_until` text,
	`superseded_by_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `supplier_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`mitigation_action_id` text NOT NULL,
	`response_type` text NOT NULL,
	`quantity_cancelled` real NOT NULL,
	`quantity_redirected` real NOT NULL,
	`quantity_received_before_action` real NOT NULL,
	`responded_at` text NOT NULL,
	`recorded_by` text NOT NULL,
	FOREIGN KEY (`mitigation_action_id`) REFERENCES `mitigation_actions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`erp_supplier_id` text,
	`default_cancellation_terms_notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
