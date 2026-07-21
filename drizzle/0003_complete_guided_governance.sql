CREATE TABLE `meeting_decision_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`meeting_id` integer NOT NULL,
	`action` text NOT NULL,
	`session_id` text NOT NULL,
	`recommendation_snapshot` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_decision_events_user_meeting_id_unique` ON `meeting_decision_events` (`user_id`,`meeting_id`,`id`);--> statement-breakpoint
CREATE TABLE `meeting_turn_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`meeting_id` integer NOT NULL,
	`client_turn_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`response` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_turn_claims_user_meeting_client_turn_unique` ON `meeting_turn_claims` (`user_id`,`meeting_id`,`client_turn_id`);--> statement-breakpoint
CREATE TABLE `meeting_turn_leases` (
	`meeting_id` integer PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_turn_id` text NOT NULL,
	`lease_token` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `meeting_approvals` ADD `session_id` text DEFAULT 'legacy:unknown' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_approvals_user_meeting_unique` ON `meeting_approvals` (`user_id`,`meeting_id`);
