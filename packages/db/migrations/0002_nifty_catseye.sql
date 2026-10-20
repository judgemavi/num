PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`filename` text NOT NULL,
	`hash` text NOT NULL,
	`parser` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`closing_balance` integer,
	`closing_date` text,
	`matched_before` integer DEFAULT false NOT NULL,
	`previous_bank_balance` text,
	`unreadable_json` text DEFAULT '[]' NOT NULL,
	`imported_on` text NOT NULL,
	`created_at` text NOT NULL,
	`undone_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_import_batches`("id", "account_id", "filename", "hash", "parser", "period_start", "period_end", "closing_balance", "closing_date", "matched_before", "previous_bank_balance", "unreadable_json", "imported_on", "created_at", "undone_at") SELECT b."id", b."account_id", d."filename", d."hash", b."parser", b."period_start", b."period_end", b."closing_balance", b."closing_date", 0, b."previous_bank_balance", b."unreadable_json", b."imported_on", b."created_at", b."undone_at" FROM `import_batches` b INNER JOIN `documents` d ON d."id" = b."document_id";--> statement-breakpoint
DROP TABLE `import_batches`;--> statement-breakpoint
ALTER TABLE `__new_import_batches` RENAME TO `import_batches`;--> statement-breakpoint
DROP TABLE `documents`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `import_batches_hash_active` ON `import_batches` (`hash`) WHERE "import_batches"."undone_at" is null;
