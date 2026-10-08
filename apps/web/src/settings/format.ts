export function categoryError(code: string): string {
  switch (code) {
    case "category_name_taken":
      return "A category already uses this name.";
    case "essential_expense_only":
      return "Only an expense category can be essential.";
    case "category_kind_locked":
      return "You cannot change this kind. A transaction or a bucket uses this category. Make a new category.";
    case "group_not_found":
      return "That group is not in the book.";
    case "group_name_taken":
      return "A group already uses this name.";
    case "category_not_found":
      return "That category is not in the book.";
    case "category_archived":
      return "This category is already archived.";
    case "category_not_archived":
      return "This category is already active.";
    case "invalid_body":
      return "Check the fields.";
    default:
      return "The change did not save. Try again.";
  }
}

export function tagError(code: string): string {
  switch (code) {
    case "tag_name_taken":
      return "A tag already uses this name.";
    case "tag_not_found":
      return "That tag is not in the book.";
    case "tag_archived":
      return "This tag is already archived.";
    case "tag_not_archived":
      return "This tag is already active.";
    case "invalid_body":
      return "Check the name.";
    default:
      return "The change did not save. Try again.";
  }
}

export function merchantError(code: string): string {
  switch (code) {
    case "merchant_name_taken":
      return "A merchant already uses this name.";
    case "merchant_not_found":
      return "That merchant is not in the book.";
    case "merchant_archived":
      return "This merchant is already archived.";
    case "merchant_not_archived":
      return "This merchant is already active.";
    case "merchant_merge_same":
      return "Choose a different merchant.";
    case "category_not_found":
    case "category_archived":
      return "Choose a category that is still in use.";
    case "invalid_body":
      return "Check the fields.";
    default:
      return "The change did not save. Try again.";
  }
}

export function ruleError(code: string): string {
  switch (code) {
    case "rule_pattern_invalid":
      return "Enter a pattern.";
    case "rule_target_required":
      return "Choose a merchant, a category, a transfer account, or a merchant with one of the others.";
    case "rule_targets_conflict":
      return "A rule cannot have a category and a transfer.";
    case "transfer_same_account":
      return "A transfer must go to a different account.";
    case "rule_not_found":
      return "That rule is not in the book.";
    case "rule_archived":
      return "This rule is already archived.";
    case "rule_not_archived":
      return "This rule is already active.";
    case "account_not_found":
    case "account_archived":
      return "Choose an account that is still in use.";
    case "merchant_not_found":
    case "merchant_archived":
      return "Choose a merchant that is still in use.";
    case "category_not_found":
    case "category_archived":
      return "Choose a category that is still in use.";
    case "invalid_body":
      return "Check the fields.";
    default:
      return "The change did not save. Try again.";
  }
}

export function kindLabel(kind: "income" | "expense"): string {
  return kind === "income" ? "Income" : "Expense";
}
