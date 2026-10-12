type MerchantRow = { id: string; name: string; archivedAt: string | null };

export function merchantOptionLists(merchants: readonly MerchantRow[], currentId: string | null) {
  const option = (merchant: MerchantRow) => ({ id: merchant.id, label: merchant.name });
  return {
    merchantOptions: merchants.filter((merchant) => merchant.archivedAt === null || merchant.id === currentId).map(option),
    archivedMerchants: merchants.filter((merchant) => merchant.archivedAt).map(option),
  };
}
