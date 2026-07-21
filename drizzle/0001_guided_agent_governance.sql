CREATE TABLE `meeting_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`meeting_id` integer NOT NULL,
	`turn_number` integer NOT NULL,
	`role` text NOT NULL,
	`structured_content` text DEFAULT '{}' NOT NULL,
	`model_metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_messages_meeting_turn_role_unique` ON `meeting_messages` (`meeting_id`,`turn_number`,`role`);--> statement-breakpoint
ALTER TABLE `meetings` ADD `client_request_id` text;--> statement-breakpoint
ALTER TABLE `meetings` ADD `lifecycle_status` text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `meetings` ADD `topic` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `meetings` ADD `phase` text DEFAULT 'intake' NOT NULL;--> statement-breakpoint
ALTER TABLE `meetings` ADD `final_recommendation` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `meetings` ADD `approval_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `meetings` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `meetings_user_client_request_unique` ON `meetings` (`user_id`,`client_request_id`);