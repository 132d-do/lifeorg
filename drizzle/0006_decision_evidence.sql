CREATE TABLE `decision_forecasts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`decision_id` integer NOT NULL,
	`meeting_id` integer,
	`client_request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`prediction` text NOT NULL,
	`evidence_snapshot` text NOT NULL,
	`confidence` integer NOT NULL,
	`version` text DEFAULT 'forecast-v1' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `decision_forecasts_user_client_request_unique` ON `decision_forecasts` (`user_id`,`client_request_id`);--> statement-breakpoint
CREATE TABLE `evidence_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`decision_id` integer NOT NULL,
	`client_request_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`verification` text NOT NULL,
	`source_type` text,
	`source_id` text,
	`source_snapshot` text DEFAULT 'null' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_items_user_client_request_unique` ON `evidence_items` (`user_id`,`client_request_id`);--> statement-breakpoint
CREATE TABLE `recommendation_evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`decision_id` integer NOT NULL,
	`meeting_id` integer,
	`cycle_id` text,
	`forecast_id` text,
	`recommendation_snapshot` text NOT NULL,
	`observed_evidence` text NOT NULL,
	`action_completion` integer NOT NULL,
	`recommendation_accuracy` integer,
	`decision_value` integer NOT NULL,
	`version` text DEFAULT 'evaluation-v1' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recommendation_evaluations_user_cycle_unique` ON `recommendation_evaluations` (`user_id`,`cycle_id`);