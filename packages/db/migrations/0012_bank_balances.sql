CREATE TABLE `bank_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`balance` integer NOT NULL,
	`import_batch_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_balances_account_date` ON `bank_balances` (`account_id`,`date`);--> statement-breakpoint
INSERT INTO `bank_balances` (`id`, `account_id`, `date`, `balance`, `import_batch_id`, `created_at`)
SELECT `c`.`id`, `c`.`account_id`, `c`.`date`, `c`.`statement_balance`, NULL, `c`.`created_at`
FROM `checkpoints` `c`
WHERE `c`.`unlocked_at` IS NULL
  AND `c`.`id` = (
    SELECT `d`.`id` FROM `checkpoints` `d`
    WHERE `d`.`account_id` = `c`.`account_id` AND `d`.`date` = `c`.`date` AND `d`.`unlocked_at` IS NULL
    ORDER BY `d`.`created_at` DESC, `d`.`id` DESC LIMIT 1
  );--> statement-breakpoint
INSERT INTO `bank_balances` (`id`, `account_id`, `date`, `balance`, `import_batch_id`, `created_at`)
SELECT `b`.`id`, `b`.`account_id`, `b`.`closing_date`, `b`.`closing_balance`, `b`.`id`, `b`.`created_at`
FROM `import_batches` `b`
WHERE `b`.`undone_at` IS NULL
  AND `b`.`closing_date` IS NOT NULL
  AND `b`.`closing_balance` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `bank_balances` `x` WHERE `x`.`account_id` = `b`.`account_id` AND `x`.`date` = `b`.`closing_date`
  )
  AND `b`.`id` = (
    SELECT `e`.`id` FROM `import_batches` `e`
    WHERE `e`.`account_id` = `b`.`account_id` AND `e`.`closing_date` = `b`.`closing_date`
      AND `e`.`undone_at` IS NULL AND `e`.`closing_balance` IS NOT NULL
    ORDER BY `e`.`created_at` DESC, `e`.`id` DESC LIMIT 1
  );--> statement-breakpoint
DROP TABLE `checkpoints`;