CREATE TABLE `final_exams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject_id` integer NOT NULL,
	`label` text NOT NULL,
	`taken_on` text,
	`result` text DEFAULT 'pendiente' NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`program_id` integer NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `programs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`institution` text,
	`color` text NOT NULL,
	`grading_scheme` text NOT NULL,
	`grade_scale` integer
);
--> statement-breakpoint
ALTER TABLE `subjects` ADD `period_id` integer REFERENCES periods(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `subjects` ADD `outcome` text;--> statement-breakpoint
ALTER TABLE `subjects` ADD `grade` real;