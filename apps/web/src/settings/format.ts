export function categoryError(code: string): string {
  switch (code) {
    case "category_name_taken":
      return "A category already uses this name.";
    case "essential_expense_only":
      return "Only an expense category can be essential.";
    case "group_not_found":
      return "That group is not in the book.";
    case "group_in_use":
      return "Move the categories out of this group before you delete it.";
    case "group_order_invalid":
      return "The group order is not valid.";
    case "category_not_found":
      return "That category is not in the book.";
    case "category_archived":
      return "This category is already archived.";
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
    case "invalid_body":
      return "Check the name.";
    default:
      return "The change did not save. Try again.";
  }
}

export function kindLabel(kind: "income" | "expense"): string {
  return kind === "income" ? "Income" : "Expense";
}
