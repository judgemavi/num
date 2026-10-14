import { fieldValue } from "@/forms/form-values";

/** The choices of "What is this?" in the bulk editor. Split is not a choice: a split is edited one at a time. */
export const bulkChoices = ["none", "spending", "income", "refund", "transfer"] as const;

export const merchantModes = ["none", "change"] as const;

/** The start values of the bulk editor. Each field starts as "No change" (decision 0051). */
export const bulkValues = {
  what: fieldValue<(typeof bulkChoices)[number]>("none"),
  categoryId: fieldValue<string | null>(null),
  transferAccountId: fieldValue<string | null>(null),
  merchant: fieldValue<(typeof merchantModes)[number]>("none"),
  merchantId: fieldValue<string | null>(null),
  addTagIds: fieldValue<string[]>([]),
  removeTagIds: fieldValue<string[]>([]),
};
