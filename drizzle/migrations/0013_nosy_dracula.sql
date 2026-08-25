CREATE TABLE `partial_exams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject_id` integer NOT NULL,
	`label` text NOT NULL,
	`taken_on` text,
	`result` text DEFAULT 'pendiente' NOT NULL,
	`grade` real,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `subjects` ADD `regularity` text;