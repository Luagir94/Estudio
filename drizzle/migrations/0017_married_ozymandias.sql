ALTER TABLE `subjects` ADD `program_id` integer REFERENCES programs(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `subjects` ADD `nivel` integer;