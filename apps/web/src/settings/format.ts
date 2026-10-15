import type { CategoryKind, ErrorCode } from "@num/shared";

export function categoryError(code: ErrorCode | undefined): string {
  switch (code) {
    case "category_name_taken":
      return "A category already uses this name.";
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

export function tagError(code: ErrorCode | undefined): string {
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

export function merchantError(code: ErrorCode | undefined): string {
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

export function kindLabel(kind: CategoryKind): string {
  return kind === "income" ? "Income" : "Expense";
}
