PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`institution` text,
	`kind` text NOT NULL,
	`on_budget` integer NOT NULL,
	`opening_date` text,
	`opening_balance` integer NOT NULL,
	`archived_at` text,
	`payment_policy` text,
	`fixed_payment` integer,
	`interest_rate_milli_pct` integer,
	`import_preset` text,
	`column_map` text
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("id", "name", "institution", "kind", "on_budget", "opening_date", "opening_balance", "archived_at", "payment_policy", "fixed_payment", "interest_rate_milli_pct", "import_preset", "column_map") SELECT "id", "name", "institution", "kind", "on_budget", "opening_date", "opening_balance", "archived_at", "payment_policy", "fixed_payment", "interest_rate_milli_pct", "import_preset", "column_map" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;