ALTER TABLE `bucket_events` DROP COLUMN `note`;--> statement-breakpoint
ALTER TABLE `categories` DROP COLUMN `essential`;--> statement-breakpoint
DELETE FROM `settings` WHERE `key` = 'staleImportDays';
