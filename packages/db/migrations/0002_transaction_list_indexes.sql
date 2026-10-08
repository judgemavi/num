DROP INDEX `transactions_account_date`;--> statement-breakpoint
CREATE INDEX `transactions_active_date` ON `transactions` (`date`,`id`) WHERE "transactions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX `transactions_active_account_date` ON `transactions` (`account_id`,`date`,`id`,`amount`) WHERE "transactions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX `transactions_active_merchant_date` ON `transactions` (`merchant_id`,`date`,`id`) WHERE "transactions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX `line_tags_tag` ON `line_tags` (`tag_id`);--> statement-breakpoint
CREATE INDEX `transaction_lines_uncategorized` ON `transaction_lines` (`transaction_id`) WHERE "transaction_lines"."category_id" is null and "transaction_lines"."transfer_account_id" is null;