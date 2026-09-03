CREATE TABLE `mcp_audit_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`occurred_at` text NOT NULL,
	`tool` text,
	`slice` text,
	`action` text,
	`outcome` text NOT NULL,
	`summary` text NOT NULL,
	`client_name` text,
	`error_code` text
);
--> statement-breakpoint
CREATE INDEX `mcp_audit_entries_occurred_at_idx` ON `mcp_audit_entries` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `mcp_audit_entries_outcome_idx` ON `mcp_audit_entries` (`outcome`);--> statement-breakpoint
CREATE TABLE `mcp_slice_permissions` (
	`slice` text PRIMARY KEY NOT NULL,
	`can_read` integer DEFAULT false NOT NULL,
	`can_write` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);
