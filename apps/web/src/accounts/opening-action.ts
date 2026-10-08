import { accountSchema, accountUpdateSchema, type Account, type OpeningSuggestion } from "@num/shared";
import { apiRequest } from "@/request";

export async function setOpeningBalance(account: Account, suggestion: OpeningSuggestion): Promise<string | null> {
  const body = accountUpdateSchema.safeParse({
    name: account.name,
    institution: account.institution,
    kind: account.kind,
    onBudget: account.onBudget,
    openingDate: suggestion.date,
    openingBalance: suggestion.amount,
    paymentPolicy: account.paymentPolicy,
    fixedPayment: account.fixedPayment,
    interestRateMilliPct: account.interestRateMilliPct,
  });
  if (!body.success) {
    return "invalid_body";
  }
  const result = await apiRequest(`/api/accounts/${account.id}`, accountSchema, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body.data),
  });
  return result.ok ? null : result.code;
}

export async function loadAccount(accountId: string): Promise<Account | null> {
  const result = await apiRequest(`/api/accounts/${accountId}`, accountSchema);
  return result.ok ? result.data : null;
}
