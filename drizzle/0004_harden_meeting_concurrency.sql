CREATE TABLE `meeting_decision_leases` (
	`meeting_id` integer PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`lease_token` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `meeting_messages` ADD `sequence` integer DEFAULT 0 NOT NULL;
