CREATE TABLE `academic_dates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`program_id` integer NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE cascade
);
