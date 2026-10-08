PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`institution` text,
	`kind` text NOT NULL,
	`on_budget` integer NOT NULL,
	`opening_date` text NOT NULL,
	`opening_balance` integer NOT NULL,
	`archived_at` text,
	`payment_policy` text,
	`fixed_payment` integer,
	`interest_rate_milli_pct` integer,
	`import_preset` text,
	`column_map` text,
	CONSTRAINT "accounts_kind" CHECK("kind" in ('chequing', 'savings', 'cash', 'credit_card', 'mortgage', 'loan', 'investment', 'property', 'receivable', 'other_asset', 'other_liability')),
	CONSTRAINT "accounts_opening_date" CHECK("opening_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "accounts_payment_policy" CHECK(("payment_policy" is null or "payment_policy" in ('full', 'fixed', 'manual'))),
	CONSTRAINT "accounts_interest_rate" CHECK("interest_rate_milli_pct" is null or "interest_rate_milli_pct" >= 0),
	CONSTRAINT "accounts_card_fields" CHECK((
"kind" = 'credit_card'
        and "payment_policy" is not null
        and ("payment_policy" <> 'fixed' or "fixed_payment" is not null)
      ) or (
"kind" <> 'credit_card'
        and "payment_policy" is null
        and "fixed_payment" is null
      ))
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("id", "name", "institution", "kind", "on_budget", "opening_date", "opening_balance", "archived_at", "payment_policy", "fixed_payment", "interest_rate_milli_pct", "import_preset", "column_map") SELECT "id", "name", "institution", "kind", "on_budget", "opening_date", "opening_balance", "archived_at", "payment_policy", "fixed_payment", "interest_rate_milli_pct", "import_preset", "column_map" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;--> statement-breakpoint
UPDATE `accounts` SET `interest_rate_milli_pct` = NULL WHERE `kind` = 'credit_card';--> statement-breakpoint
PRAGMA foreign_keys=ON;