DROP TABLE `inbox_dismissals`;--> statement-breakpoint
CREATE TABLE `inbox_decisions` (
	`item_key` text PRIMARY KEY NOT NULL,
	`decision` text NOT NULL,
	`reason` text,
	`decided_at` text NOT NULL,
	CONSTRAINT "inbox_decisions_decision" CHECK("inbox_decisions"."decision" in ('not_transfer', 'keep_plan_amount', 'not_recurring', 'keep_unassigned', 'not_a_transaction'))
);
