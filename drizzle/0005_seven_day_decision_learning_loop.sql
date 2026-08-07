CREATE TABLE `cycle_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cycle_id` text NOT NULL,
	`client_request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`represented_local_date` text,
	`payload` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cycle_events_user_cycle_client_request_unique` ON `cycle_events` (`user_id`,`cycle_id`,`client_request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cycle_events_cycle_sequence_unique` ON `cycle_events` (`cycle_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `operating_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`active_slot` text,
	`source_type` text NOT NULL,
	`source_record_id` text NOT NULL,
	`source_mutation_hash` text,
	`commitment` text NOT NULL,
	`start_local_date` text NOT NULL,
	`review_local_date` text NOT NULL,
	`time_zone` text DEFAULT 'Asia/Shanghai' NOT NULL,
	`success_criterion` text NOT NULL,
	`stop_or_adjust_condition` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`projection` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operating_cycles_user_client_request_unique` ON `operating_cycles` (`user_id`,`client_request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `operating_cycles_user_active_slot_unique` ON `operating_cycles` (`user_id`,`active_slot`);