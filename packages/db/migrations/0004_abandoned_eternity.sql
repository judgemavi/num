DROP TABLE `month_holds`;--> statement-breakpoint
ALTER TABLE `schedules` DROP COLUMN `payday`;--> statement-breakpoint
DELETE FROM `settings` WHERE `key` = 'bufferAmount';