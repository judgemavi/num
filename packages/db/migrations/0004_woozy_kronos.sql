PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_valuations` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`balance` integer NOT NULL,
	`note` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_valuations`("id", "account_id", "date", "balance", "note") SELECT "id", "account_id", "date", "balance", "note" FROM `valuations`;--> statement-breakpoint
DROP TABLE `valuations`;--> statement-breakpoint
ALTER TABLE `__new_valuations` RENAME TO `valuations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `valuations_account_date` ON `valuations` (`account_id`,`date`);