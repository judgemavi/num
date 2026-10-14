import type { Category, CategoryKind } from "@num/shared";

/** The active categories of one kind, in name order. An archived category stays in the list while it is selected. */
export function categoryOptions(categories: Category[], kind: CategoryKind, selected: string | null) {
  return categories
    .filter((category) => category.kind === kind && (category.archivedAt === null || category.id === selected))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((category) => ({ id: category.id, label: category.archivedAt ? `${category.name} (archived)` : category.name }));
}

type MerchantRow = { id: string; name: string; archivedAt: string | null };

export function merchantOptionLists(merchants: readonly MerchantRow[], currentId: string | null) {
  const option = (merchant: MerchantRow) => ({ id: merchant.id, label: merchant.name });
  return {
    merchantOptions: merchants.filter((merchant) => merchant.archivedAt === null || merchant.id === currentId).map(option),
    archivedMerchants: merchants.filter((merchant) => merchant.archivedAt).map(option),
  };
}
