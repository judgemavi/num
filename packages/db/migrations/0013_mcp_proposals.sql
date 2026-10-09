PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`result_ref` text,
	`created_at` text NOT NULL,
	`decided_at` text,
	CONSTRAINT "proposals_status" CHECK("status" in ('pending', 'applied', 'expired')),
	CONSTRAINT "proposals_payload_json" CHECK(json_valid("payload_json")),
	CONSTRAINT "proposals_decided_at" CHECK((
        "status" = 'pending' and "decided_at" is null
      ) or (
        "status" <> 'pending' and "decided_at" is not null
      ))
);
--> statement-breakpoint
DROP TABLE `proposals`;--> statement-breakpoint
ALTER TABLE `__new_proposals` RENAME TO `proposals`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_token_hash_unique` ON `proposals` (`token_hash`);--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT "settings_key" CHECK("key" in ('currency', 'bufferAmount', 'emergencyFundMonths', 'staleImportDays', 'recurringGraceDays', 'autoConfidence', 'aiCanWrite'))
);
--> statement-breakpoint
INSERT INTO `__new_settings`("key", "value") SELECT "key", "value" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;