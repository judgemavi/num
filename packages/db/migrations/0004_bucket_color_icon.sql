PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`priority` integer NOT NULL,
	`essential` integer NOT NULL,
	`color` text NOT NULL,
	`icon` text NOT NULL,
	`archived_at` text,
	`refill_to` integer,
	`amount` integer,
	`due_date` text,
	`repeat` text,
	`target` integer,
	`target_date` text,
	`fixed_amount` integer,
	CONSTRAINT "buckets_kind" CHECK("kind" in ('spending', 'sinking', 'goal')),
	CONSTRAINT "buckets_color" CHECK("color" in ('sky', 'mint', 'lilac', 'butter', 'pink', 'teal')),
	CONSTRAINT "buckets_icon" CHECK("icon" in ('shopping-cart', 'utensils', 'fuel', 'smile', 'package', 'shirt', 'paw-print', 'heart', 'shield', 'gift', 'wrench', 'house', 'plane', 'car', 'baby', 'briefcase', 'piggy-bank', 'wallet', 'coffee', 'bus')),
	CONSTRAINT "buckets_repeat" CHECK(("repeat" is null or "repeat" in ('none', 'yearly'))),
	CONSTRAINT "buckets_due_date" CHECK(("due_date" is null or "due_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
	CONSTRAINT "buckets_target_date" CHECK(("target_date" is null or "target_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
	CONSTRAINT "buckets_amounts" CHECK((
        ("refill_to" is null or "refill_to" >= 0)
        and ("amount" is null or "amount" >= 0)
        and ("target" is null or "target" >= 0)
        and ("fixed_amount" is null or "fixed_amount" >= 0)
      )),
	CONSTRAINT "buckets_kind_fields" CHECK((
"kind" = 'spending'
        and "refill_to" is not null
        and "amount" is null
        and "due_date" is null
        and "repeat" is null
        and "target" is null
        and "target_date" is null
        and "fixed_amount" is null
      ) or (
"kind" = 'sinking'
        and "amount" is not null
        and "due_date" is not null
        and "repeat" is not null
        and "refill_to" is null
        and "target" is null
        and "target_date" is null
        and "fixed_amount" is null
      ) or (
"kind" = 'goal'
        and "target" is not null
        and "refill_to" is null
        and "amount" is null
        and "due_date" is null
        and "repeat" is null
        and (
          ("target_date" is not null and "fixed_amount" is null)
          or ("target_date" is null and "fixed_amount" is not null)
        )
      ))
);
--> statement-breakpoint
INSERT INTO `__new_buckets`("id", "name", "kind", "priority", "essential", "color", "icon", "archived_at", "refill_to", "amount", "due_date", "repeat", "target", "target_date", "fixed_amount") SELECT "id", "name", "kind", "priority", "essential", CASE (("row_number"() OVER (ORDER BY "id")) - 1) % 6 WHEN 0 THEN 'sky' WHEN 1 THEN 'mint' WHEN 2 THEN 'lilac' WHEN 3 THEN 'butter' WHEN 4 THEN 'pink' ELSE 'teal' END, 'shopping-cart', "archived_at", "refill_to", "amount", "due_date", "repeat", "target", "target_date", "fixed_amount" FROM `buckets`;--> statement-breakpoint
DROP TABLE `buckets`;--> statement-breakpoint
ALTER TABLE `__new_buckets` RENAME TO `buckets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;