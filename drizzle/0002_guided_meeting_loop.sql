ALTER TABLE `meeting_messages` ADD `client_turn_id` text;
--> statement-breakpoint
CREATE TABLE `meeting_approvals` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `meeting_id` integer NOT NULL,
  `idempotency_key` text NOT NULL,
  `mutation_hash` text NOT NULL,
  `approved_mutations` text DEFAULT '[]' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_approvals_user_meeting_key_unique` ON `meeting_approvals` (`user_id`,`meeting_id`,`idempotency_key`);
--> statement-breakpoint
CREATE TABLE `decision_reviews` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `decision_id` integer NOT NULL,
  `meeting_id` integer NOT NULL,
  `outcome` text NOT NULL,
  `observed_at` text NOT NULL,
  `decision_snapshot` text NOT NULL,
  `recommendation_snapshot` text NOT NULL,
  `mutation_hash` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `decision_reviews_user_meeting_decision_unique` ON `decision_reviews` (`user_id`,`meeting_id`,`decision_id`);
