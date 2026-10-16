import { amountText, balanceFromEntry, entryFromBalance, parseAmount, valuationInputSchema, type AccountKind, type Valuation } from "@num/shared";
import { editPatch, keptAmount } from "@/forms/form-values";

/** Keep the entry values for comparison, then use the stored sign in the request. */
export function valuationBody(currency: string, kind: AccountKind, value: { date: string; amount: string; note: string }, saved: Valuation | null) {
  const start = saved ? { text: amountText(entryFromBalance(kind, saved.balance)), amount: entryFromBalance(kind, saved.balance) } : null;
  try {
    const balance = keptAmount(value.amount, start, (text) => parseAmount(currency, text.trim()));
    const parsed = valuationInputSchema.safeParse({ date: value.date, balance, note: value.note.trim() || null });
    if (!parsed.success) return null;
    const entry = parsed.data;
    const body = { ...entry, balance: balanceFromEntry(kind, entry.balance) };
    const changed = saved ? editPatch(entry, { date: saved.date, balance: entryFromBalance(kind, saved.balance), note: saved.note }) : null;
    const patch = changed === null ? null : {
      ...changed,
      ...(changed.balance === undefined ? {} : { balance: balanceFromEntry(kind, changed.balance) }),
    };
    return { body, patch };
  } catch {
    return null;
  }
}
