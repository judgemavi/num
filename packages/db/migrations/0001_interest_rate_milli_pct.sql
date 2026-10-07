ALTER TABLE `accounts` RENAME COLUMN `interest_rate_bps` TO `interest_rate_milli_pct`;
--> statement-breakpoint
ALTER TABLE `mortgage_terms` RENAME COLUMN `rate_bps` TO `rate_milli_pct`;
