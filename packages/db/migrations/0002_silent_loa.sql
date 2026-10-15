ALTER TABLE `buckets` ADD `can_recede` integer;--> statement-breakpoint
ALTER TABLE `buckets` ADD `paused_at` text;--> statement-breakpoint
UPDATE `buckets` SET `can_recede` = (`kind` IN ('goal', 'emergency')) WHERE `kind` IN ('sinking', 'goal', 'emergency');