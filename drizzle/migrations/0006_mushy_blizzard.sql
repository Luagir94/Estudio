CREATE TABLE `attachment_chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`attachment_id` integer NOT NULL,
	`subject_id` integer NOT NULL,
	`chunk_index` integer NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `attachments` ADD `index_status` text DEFAULT 'pending' NOT NULL;