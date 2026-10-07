CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`institution` text,
	`kind` text NOT NULL,
	`on_budget` integer NOT NULL,
	`opening_date` text NOT NULL,
	`opening_balance` integer NOT NULL,
	`archived_at` text,
	`credit_limit` integer,
	`statement_day` integer,
	`due_day` integer,
	`payment_policy` text,
	`fixed_payment` integer,
	`interest_rate_bps` integer,
	CONSTRAINT "accounts_kind" CHECK("accounts"."kind" in ('chequing', 'savings', 'cash', 'credit_card', 'mortgage', 'loan', 'investment', 'property', 'receivable', 'other_asset', 'other_liability')),
	CONSTRAINT "accounts_opening_date" CHECK("accounts"."opening_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "accounts_statement_day" CHECK(("accounts"."statement_day" is null or ("accounts"."statement_day" between 1 and 31))),
	CONSTRAINT "accounts_due_day" CHECK(("accounts"."due_day" is null or ("accounts"."due_day" between 1 and 31))),
	CONSTRAINT "accounts_payment_policy" CHECK(("accounts"."payment_policy" is null or "accounts"."payment_policy" in ('full', 'fixed', 'manual'))),
	CONSTRAINT "accounts_interest_rate" CHECK("accounts"."interest_rate_bps" is null or "accounts"."interest_rate_bps" >= 0),
	CONSTRAINT "accounts_card_fields" CHECK((
        "accounts"."kind" = 'credit_card'
        and "accounts"."payment_policy" is not null
        and ("accounts"."payment_policy" <> 'fixed' or "accounts"."fixed_payment" is not null)
      ) or (
        "accounts"."kind" <> 'credit_card'
        and "accounts"."credit_limit" is null
        and "accounts"."statement_day" is null
        and "accounts"."due_day" is null
        and "accounts"."payment_policy" is null
        and "accounts"."fixed_payment" is null
      ))
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`before` text,
	`after` text,
	`source` text NOT NULL,
	`at` text NOT NULL,
	CONSTRAINT "audit_log_source" CHECK("audit_log"."source" in ('ui', 'import', 'mcp')),
	CONSTRAINT "audit_log_json" CHECK((
        "audit_log"."before" is null or json_valid("audit_log"."before")
      ) and (
        "audit_log"."after" is null or json_valid("audit_log"."after")
      ))
);
--> statement-breakpoint
CREATE INDEX `audit_log_entity` ON `audit_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE TABLE `bucket_categories` (
	`category_id` text PRIMARY KEY NOT NULL,
	`bucket_id` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bucket_id`) REFERENCES `buckets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bucket_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`bucket_id` text NOT NULL,
	`other_bucket_id` text,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`note` text,
	`funding_run_id` text,
	`undone_at` text,
	FOREIGN KEY (`bucket_id`) REFERENCES `buckets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`other_bucket_id`) REFERENCES `buckets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`funding_run_id`) REFERENCES `funding_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bucket_events_kind" CHECK("bucket_events"."kind" in ('fund', 'move', 'release')),
	CONSTRAINT "bucket_events_amount" CHECK("bucket_events"."amount" > 0),
	CONSTRAINT "bucket_events_date" CHECK("bucket_events"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "bucket_events_move" CHECK((
        "bucket_events"."kind" = 'move'
        and "bucket_events"."other_bucket_id" is not null
        and "bucket_events"."other_bucket_id" <> "bucket_events"."bucket_id"
      ) or (
        "bucket_events"."kind" <> 'move'
        and "bucket_events"."other_bucket_id" is null
      ))
);
--> statement-breakpoint
CREATE INDEX `bucket_events_bucket` ON `bucket_events` (`bucket_id`);--> statement-breakpoint
CREATE TABLE `buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`priority` integer NOT NULL,
	`essential` integer NOT NULL,
	`archived_at` text,
	`refill_to` integer,
	`amount` integer,
	`due_date` text,
	`repeat` text,
	`target` integer,
	`target_date` text,
	`fixed_amount` integer,
	CONSTRAINT "buckets_kind" CHECK("buckets"."kind" in ('spending', 'sinking', 'goal')),
	CONSTRAINT "buckets_repeat" CHECK(("buckets"."repeat" is null or "buckets"."repeat" in ('none', 'yearly'))),
	CONSTRAINT "buckets_due_date" CHECK(("buckets"."due_date" is null or "buckets"."due_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
	CONSTRAINT "buckets_target_date" CHECK(("buckets"."target_date" is null or "buckets"."target_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
	CONSTRAINT "buckets_amounts" CHECK((
        ("buckets"."refill_to" is null or "buckets"."refill_to" >= 0)
        and ("buckets"."amount" is null or "buckets"."amount" >= 0)
        and ("buckets"."target" is null or "buckets"."target" >= 0)
        and ("buckets"."fixed_amount" is null or "buckets"."fixed_amount" >= 0)
      )),
	CONSTRAINT "buckets_kind_fields" CHECK((
        "buckets"."kind" = 'spending'
        and "buckets"."refill_to" is not null
        and "buckets"."amount" is null
        and "buckets"."due_date" is null
        and "buckets"."repeat" is null
        and "buckets"."target" is null
        and "buckets"."target_date" is null
        and "buckets"."fixed_amount" is null
      ) or (
        "buckets"."kind" = 'sinking'
        and "buckets"."amount" is not null
        and "buckets"."due_date" is not null
        and "buckets"."repeat" is not null
        and "buckets"."refill_to" is null
        and "buckets"."target" is null
        and "buckets"."target_date" is null
        and "buckets"."fixed_amount" is null
      ) or (
        "buckets"."kind" = 'goal'
        and "buckets"."target" is not null
        and "buckets"."refill_to" is null
        and "buckets"."amount" is null
        and "buckets"."due_date" is null
        and "buckets"."repeat" is null
        and (
          ("buckets"."target_date" is not null and "buckets"."fixed_amount" is null)
          or ("buckets"."target_date" is null and "buckets"."fixed_amount" is not null)
        )
      ))
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`group_id` text,
	`essential` integer NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`group_id`) REFERENCES `category_groups`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "categories_kind" CHECK("categories"."kind" in ('income', 'expense')),
	CONSTRAINT "categories_essential" CHECK("categories"."kind" = 'expense' or "categories"."essential" = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_lower_unique` ON `categories` (lower("name"));--> statement-breakpoint
CREATE TABLE `category_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`statement_balance` integer NOT NULL,
	`created_at` text NOT NULL,
	`unlocked_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "checkpoints_date" CHECK("checkpoints"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE INDEX `checkpoints_account_date` ON `checkpoints` (`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`hash` text NOT NULL,
	`mime_type` text NOT NULL,
	`storage_path` text NOT NULL,
	`uploaded_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_hash_unique` ON `documents` (`hash`);--> statement-breakpoint
CREATE TABLE `forecast_snapshots` (
	`month` text PRIMARY KEY NOT NULL,
	`as_of` text NOT NULL,
	`predicted_total` integer NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "forecast_snapshots_month" CHECK("forecast_snapshots"."month" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "forecast_snapshots_as_of" CHECK("forecast_snapshots"."as_of" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE TABLE `funding_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`income_transaction_id` text NOT NULL,
	`date` text NOT NULL,
	`created_at` text NOT NULL,
	`undone_at` text,
	FOREIGN KEY (`income_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "funding_runs_date" CHECK("funding_runs"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `funding_runs_income_active` ON `funding_runs` (`income_transaction_id`) WHERE "funding_runs"."undone_at" is null;--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`document_id` text,
	`proposal_id` text,
	`parser` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`closing_balance` integer,
	`closing_date` text,
	`created_at` text NOT NULL,
	`undone_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "import_batches_period_start" CHECK("import_batches"."period_start" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "import_batches_period_end" CHECK("import_batches"."period_end" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "import_batches_closing_date" CHECK(("import_batches"."closing_date" is null or "import_batches"."closing_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
	CONSTRAINT "import_batches_source" CHECK((
        "import_batches"."document_id" is not null and "import_batches"."proposal_id" is null
      ) or (
        "import_batches"."document_id" is null and "import_batches"."proposal_id" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE `import_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`account_id` text NOT NULL,
	`row_index` integer NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`payee_raw` text NOT NULL,
	`bank_id` text,
	`identity` text NOT NULL,
	`outcome` text NOT NULL,
	`transaction_id` text,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "import_rows_row_index" CHECK("import_rows"."row_index" >= 0),
	CONSTRAINT "import_rows_date" CHECK("import_rows"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "import_rows_outcome" CHECK("import_rows"."outcome" in ('created', 'matched', 'duplicate', 'ignored'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_rows_batch_row_unique` ON `import_rows` (`batch_id`,`row_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `import_rows_account_identity_active` ON `import_rows` (`account_id`,`identity`) WHERE "import_rows"."active" = 1 and "import_rows"."outcome" <> 'duplicate';--> statement-breakpoint
CREATE INDEX `import_rows_batch` ON `import_rows` (`batch_id`);--> statement-breakpoint
CREATE TABLE `inbox_dismissals` (
	`item_key` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`dismissed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `line_tags` (
	`line_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`line_id`, `tag_id`),
	FOREIGN KEY (`line_id`) REFERENCES `transaction_lines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`default_category_id` text,
	`archived_at` text,
	FOREIGN KEY (`default_category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchants_name_lower_unique` ON `merchants` (lower("name"));--> statement-breakpoint
CREATE TABLE `month_closes` (
	`month` text PRIMARY KEY NOT NULL,
	`closed_at` text NOT NULL,
	`reopened_at` text,
	`reopen_reason` text,
	`summary_json` text NOT NULL,
	CONSTRAINT "month_closes_month" CHECK("month_closes"."month" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "month_closes_summary_json" CHECK(json_valid("month_closes"."summary_json")),
	CONSTRAINT "month_closes_reopen" CHECK((
        "month_closes"."reopened_at" is null and "month_closes"."reopen_reason" is null
      ) or (
        "month_closes"."reopened_at" is not null and "month_closes"."reopen_reason" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE `mortgage_terms` (
	`account_id` text PRIMARY KEY NOT NULL,
	`principal` integer NOT NULL,
	`principal_as_of` text NOT NULL,
	`rate_bps` integer NOT NULL,
	`compounding` text NOT NULL,
	`payment_amount` integer NOT NULL,
	`payment_frequency` text NOT NULL,
	`first_payment_date` text NOT NULL,
	`term_end` text NOT NULL,
	`amortization_months_remaining` integer NOT NULL,
	`payment_account_id` text NOT NULL,
	`interest_category_id` text NOT NULL,
	`property_account_id` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`interest_category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "mortgage_terms_rate" CHECK("mortgage_terms"."rate_bps" >= 0),
	CONSTRAINT "mortgage_terms_months" CHECK("mortgage_terms"."amortization_months_remaining" >= 0),
	CONSTRAINT "mortgage_terms_compounding" CHECK("mortgage_terms"."compounding" in ('monthly', 'semiannual')),
	CONSTRAINT "mortgage_terms_frequency" CHECK("mortgage_terms"."payment_frequency" in ('weekly', 'biweekly', 'semimonthly', 'monthly')),
	CONSTRAINT "mortgage_terms_principal_as_of" CHECK("mortgage_terms"."principal_as_of" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "mortgage_terms_first_payment" CHECK("mortgage_terms"."first_payment_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "mortgage_terms_term_end" CHECK("mortgage_terms"."term_end" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE TABLE `occurrence_links` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`due_date` text NOT NULL,
	`transaction_id` text,
	`skipped` integer NOT NULL,
	`reason` text,
	FOREIGN KEY (`plan_id`) REFERENCES `recurring_plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "occurrence_links_due_date" CHECK("occurrence_links"."due_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "occurrence_links_result" CHECK((
        "occurrence_links"."transaction_id" is not null
        and "occurrence_links"."skipped" = 0
        and "occurrence_links"."reason" is null
      ) or (
        "occurrence_links"."transaction_id" is null
        and "occurrence_links"."skipped" = 1
        and "occurrence_links"."reason" is not null
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `occurrence_links_transaction_id_unique` ON `occurrence_links` (`transaction_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `occurrence_links_plan_due_date` ON `occurrence_links` (`plan_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`result_ref` text,
	`created_at` text NOT NULL,
	`decided_at` text,
	CONSTRAINT "proposals_status" CHECK("proposals"."status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "proposals_payload_json" CHECK(json_valid("proposals"."payload_json")),
	CONSTRAINT "proposals_decided_at" CHECK((
        "proposals"."status" = 'pending' and "proposals"."decided_at" is null
      ) or (
        "proposals"."status" <> 'pending' and "proposals"."decided_at" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE `recurring_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`account_id` text NOT NULL,
	`expected_amount` integer NOT NULL,
	`tolerance` integer NOT NULL,
	`amount_mode` text NOT NULL,
	`category_id` text,
	`transfer_account_id` text,
	`merchant_id` text,
	`start_date` text NOT NULL,
	`freq` text NOT NULL,
	`interval` integer NOT NULL,
	`month_day` integer,
	`business_day_shift` text NOT NULL,
	`end_date` text,
	`active` integer NOT NULL,
	`funds_buckets` integer NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transfer_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recurring_plans_kind" CHECK("recurring_plans"."kind" in ('income', 'bill', 'transfer')),
	CONSTRAINT "recurring_plans_amount_mode" CHECK("recurring_plans"."amount_mode" in ('fixed', 'variable')),
	CONSTRAINT "recurring_plans_freq" CHECK("recurring_plans"."freq" in ('weekly', 'monthly', 'yearly')),
	CONSTRAINT "recurring_plans_shift" CHECK("recurring_plans"."business_day_shift" in ('none', 'next', 'previous')),
	CONSTRAINT "recurring_plans_tolerance" CHECK("recurring_plans"."tolerance" >= 0),
	CONSTRAINT "recurring_plans_interval" CHECK("recurring_plans"."interval" >= 1),
	CONSTRAINT "recurring_plans_start_date" CHECK("recurring_plans"."start_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "recurring_plans_end_date" CHECK(("recurring_plans"."end_date" is null or "recurring_plans"."end_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
	CONSTRAINT "recurring_plans_month_day" CHECK("recurring_plans"."month_day" is null or (
        "recurring_plans"."freq" <> 'weekly'
        and ("recurring_plans"."month_day" = -1 or ("recurring_plans"."month_day" between 1 and 31))
      )),
	CONSTRAINT "recurring_plans_kind_fields" CHECK((
        "recurring_plans"."kind" = 'transfer'
        and "recurring_plans"."transfer_account_id" is not null
        and "recurring_plans"."transfer_account_id" <> "recurring_plans"."account_id"
        and "recurring_plans"."category_id" is null
      ) or (
        "recurring_plans"."kind" <> 'transfer'
        and "recurring_plans"."transfer_account_id" is null
      )),
	CONSTRAINT "recurring_plans_funds_buckets" CHECK("recurring_plans"."funds_buckets" = 0 or "recurring_plans"."kind" = 'income')
);
--> statement-breakpoint
CREATE TABLE `rules` (
	`id` text PRIMARY KEY NOT NULL,
	`match` text NOT NULL,
	`pattern` text NOT NULL,
	`account_id` text,
	`merchant_id` text,
	`category_id` text,
	`priority` integer NOT NULL,
	`origin` text NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "rules_match" CHECK("rules"."match" in ('exact', 'prefix', 'contains', 'regex')),
	CONSTRAINT "rules_origin" CHECK("rules"."origin" in ('manual', 'promoted')),
	CONSTRAINT "rules_target" CHECK("rules"."merchant_id" is not null or "rules"."category_id" is not null)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT "settings_key" CHECK("settings"."key" in ('currency', 'bufferAmount', 'emergencyFundMonths', 'staleImportDays', 'promoteAfter', 'recurringGraceDays'))
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_lower_unique` ON `tags` (lower("name"));--> statement-breakpoint
CREATE TABLE `transaction_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`amount` integer NOT NULL,
	`memo` text,
	`category_id` text,
	`transfer_account_id` text,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transfer_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transaction_lines_category_or_transfer" CHECK("transaction_lines"."category_id" is null or "transaction_lines"."transfer_account_id" is null)
);
--> statement-breakpoint
CREATE INDEX `transaction_lines_transaction` ON `transaction_lines` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `transaction_lines_category` ON `transaction_lines` (`category_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_lines_one_transfer` ON `transaction_lines` (`transaction_id`) WHERE "transaction_lines"."transfer_account_id" is not null;--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`merchant_id` text,
	`notes` text,
	`payee_raw` text NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`import_row_id` text,
	`transfer_peer_id` text,
	`deleted_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_row_id`) REFERENCES `import_rows`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transfer_peer_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transactions_date" CHECK("transactions"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "transactions_status" CHECK("transactions"."status" in ('open', 'cleared', 'reconciled')),
	CONSTRAINT "transactions_source" CHECK("transactions"."source" in ('import', 'manual', 'mcp')),
	CONSTRAINT "transactions_transfer_peer" CHECK("transactions"."transfer_peer_id" is null or "transactions"."transfer_peer_id" <> "transactions"."id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_import_row_id_unique` ON `transactions` (`import_row_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_transfer_peer_id_unique` ON `transactions` (`transfer_peer_id`);--> statement-breakpoint
CREATE INDEX `transactions_account_date` ON `transactions` (`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `valuations` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`balance` integer NOT NULL,
	`note` text,
	`document_id` text,
	`deleted_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "valuations_date" CHECK("valuations"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `valuations_account_date_active` ON `valuations` (`account_id`,`date`) WHERE "valuations"."deleted_at" is null;