import { z } from "zod";

export const errorCodes = [
  "as_of_required",
  "as_of_invalid",
  "sort_unknown",
  "invalid_query",
  "invalid_body",
  "invalid_params",
  "setup_already_complete",
  "setup_required",
  "currency_locked",
  "account_not_found",
  "account_archived",
  "kind_class_mismatch",
  "archive_confirmation_required",
  "card_fields_invalid",
  "interest_rate_invalid",
  "category_not_found",
  "category_archived",
  "category_name_taken",
  "essential_expense_only",
  "group_not_found",
  "group_in_use",
  "group_order_invalid",
  "tag_not_found",
  "tag_archived",
  "tag_name_taken",
  "internal_error",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export const errorSchema = z.object({
  code: z.enum(errorCodes),
  params: z.record(z.string(), z.string()),
});

export type ErrorBody = z.infer<typeof errorSchema>;
