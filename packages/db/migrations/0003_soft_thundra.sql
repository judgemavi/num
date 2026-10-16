DROP INDEX `audit_log_entity`;--> statement-breakpoint
CREATE INDEX `import_rows_transaction` ON `import_rows` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `transaction_lines_transfer_account` ON `transaction_lines` (`transfer_account_id`) WHERE "transaction_lines"."transfer_account_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `transactions_auto_reason` ON `transactions` (`auto_reason`) WHERE "transactions"."auto_reason" IS NOT NULL;