CREATE TABLE `attendance_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject_id` integer NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_records_subject_date_unique` ON `attendance_records` (`subject_id`,`date`);--> statement-breakpoint
CREATE TABLE `class_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject_id` integer NOT NULL,
	`date` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `class_notes_subject_date_unique` ON `class_notes` (`subject_id`,`date`);