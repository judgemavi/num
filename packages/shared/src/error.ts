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
  "account_not_archived",
  "kind_class_mismatch",
  "archive_confirmation_required",
  "card_fields_invalid",
  "interest_rate_invalid",
  "category_not_found",
  "category_archived",
  "category_not_archived",
  "category_name_taken",
  "category_kind_locked",
  "essential_expense_only",
  "group_not_found",
  "group_order_invalid",
  "tag_not_found",
  "tag_archived",
  "tag_not_archived",
  "tag_name_taken",
  "transaction_not_found",
  "transaction_reconciled",
  "transaction_status_invalid",
  "lines_required",
  "lines_sum_mismatch",
  "line_target_conflict",
  "transfer_same_account",
  "transfer_line_limit",
  "mirror_one_line",
  "mirror_amount_locked",
  "payee_raw_locked",
  "merchant_not_found",
  "merchant_archived",
  "internal_error",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export const errorSchema = z.object({
  code: z.enum(errorCodes),
  params: z.record(z.string(), z.string()),
});

export type ErrorBody = z.infer<typeof errorSchema>;
