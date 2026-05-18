CREATE TABLE IF NOT EXISTS `deletion_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestedBy` int NOT NULL,
	`targetTable` varchar(50) NOT NULL,
	`targetId` int NOT NULL,
	`reason` text NOT NULL,
	`reasonCategory` enum('data_error','duplicate','customer_request','compliance','test_data','other') NOT NULL,
	`impactAnalysis` text,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`reviewComment` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deletion_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `contractors` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `contractors` ADD `deletedBy` int;--> statement-breakpoint
ALTER TABLE `contracts` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `contracts` ADD `deletedBy` int;--> statement-breakpoint
ALTER TABLE `distributions` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `distributions` ADD `deletedBy` int;--> statement-breakpoint
ALTER TABLE `lab_orders` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `lab_orders` ADD `deletedBy` int;--> statement-breakpoint
-- samples.deletedAt / deletedBy: already added in 0031_soft_delete_samples.sql
ALTER TABLE `users` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `deletedBy` int;