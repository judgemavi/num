import {
  choicesForDirection,
  defaultChoice,
  inboxGroupApplyResultSchema,
  merchantForChoice,
  moneyDirection,
  normalizePayee,
  transactionSchema,
  type Account,
  type Category,
  type Merchant,
  type Transaction,
  type WhatChoice,
} from "@num/shared";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LoadError, LoadingLine } from "@/editors/load-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError, FieldLabel } from "@/components/ui/field";
import { apiRequest } from "@/request";
import { formatMoney as formatDisplayMoney } from "@/money";
import { PayeeRuleField } from "@/transactions/payee-rule-field";
import { transactionError } from "@/transactions/format";
import { WhatIsThis } from "@/transactions/what-is-this";

type GroupEditorProps = {
  ids: string[];
  currency: string;
  accounts: Account[];
  categories: Category[];
  merchants: Merchant[];
  onClose: () => void;
  onSaved: (id: string) => void;
};

export function GroupEditor({ ids, currency, accounts, categories, merchants, onClose, onSaved }: GroupEditorProps) {
  const queryClient = useQueryClient();
  const loaded = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["transaction", id],
      queryFn: async () => {
        const result = await apiRequest(`/api/transactions/${id}`, transactionSchema);
        if (!result.ok) {
          throw new Error(result.code);
        }
        return result.data;
      },
    })),
  });
  const transactions = loaded.flatMap((query) => (query.data ? [query.data] : []));
  const pending = loaded.some((query) => query.isPending);
  const failed = loaded.some((query) => query.isError);
  if (pending) {
    return <LoadingLine label="Loading the transactions." />;
  }
  if (failed || transactions.length !== ids.length) {
    return <LoadError label="The transactions did not load." onRetry={() => loaded.forEach((query) => void query.refetch())} />;
  }
  return (
    <GroupForm
      currency={currency}
      transactions={transactions}
      accounts={accounts}
      categories={categories}
      merchants={merchants}
      onClose={onClose}
      onSaved={async (id) => {
        await queryClient.invalidateQueries({ queryKey: ["transactions"] });
        await queryClient.invalidateQueries({ queryKey: ["transaction"] });
        await queryClient.invalidateQueries({ queryKey: ["inbox"] });
        onSaved(id);
      }}
    />
  );
}

function GroupForm({
  currency,
  transactions,
  accounts,
  categories,
  merchants,
  onClose,
  onSaved,
}: {
  currency: string;
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  merchants: Merchant[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const direction = transactions.filter((item) => item.amount > 0).length > transactions.filter((item) => item.amount < 0).length ? "in" : "out";
  const [excluded, setExcluded] = useState<string[]>([]);
  const [choice, setChoice] = useState<WhatChoice>(defaultChoice(direction));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [transferAccountId, setTransferAccountId] = useState<string | null>(null);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [always, setAlways] = useState(false);
  const [ruleMatch, setRuleMatch] = useState<"exact" | "prefix" | "contains">("exact");
  const [rulePattern, setRulePattern] = useState(normalizePayee(transactions[0]?.payeeRaw ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const included = transactions.filter((item) => !excluded.includes(item.id));
  const total = included.reduce((sum, item) => sum + item.amount, 0);
  const sameSign = included.every((item) => item.amount === 0 || Math.sign(item.amount) === Math.sign(total || item.amount));
  const shownTotal = sameSign ? Math.abs(total) : total;
  const payee = transactions[0]?.payeeRaw ?? "";
  const accountId = included[0]?.accountId ?? transactions[0]?.accountId ?? "";
  const transferOptions = accounts
    .filter((account) => account.id !== accountId && account.archivedAt === null)
    .map((account) => ({ id: account.id, label: account.name }));
  const saveDisabled = saving || included.length === 0 || (choice === "transfer" && !transferAccountId);

  async function save() {
    if (included.length === 0) {
      return;
    }
    if (choice !== "transfer" && !categoryId) {
      setError("Choose a category.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await apiRequest("/api/inbox/groups", inboxGroupApplyResultSchema, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountId,
        transactionIds: transactions.map((item) => item.id),
        excludedIds: excluded,
        categoryId: choice === "transfer" ? null : categoryId,
        transferAccountId: choice === "transfer" ? transferAccountId : null,
        merchantId: choice === "transfer" ? null : merchantId,
        rule:
          always && rulePattern.trim().length > 0
            ? { payee: normalizePayee(payee), match: ruleMatch, pattern: rulePattern.trim() }
            : null,
      }),
    });
    setSaving(false);
    if (!result.ok) {
      setError(transactionError(result.code));
      return;
    }
    if (result.data.skipped.length > 0) {
      setNotice(`Applied to ${result.data.applied} · skipped ${result.data.skipped.length}`);
      return;
    }
    onSaved(included[0]?.id ?? "");
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {included.length} {included.length === 1 ? "transaction" : "transactions"} · {formatDisplayMoney(currency, shownTotal)}
        </DialogTitle>
        <DialogDescription>This applies to every transaction you leave in the list.</DialogDescription>
      </DialogHeader>
      <ul className="grid gap-2">
        {transactions.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <Checkbox
              id={`keep-${item.id}`}
              checked={!excluded.includes(item.id)}
              onCheckedChange={(value) => {
                setExcluded((current) => (value === true ? current.filter((id) => id !== item.id) : [...current, item.id]));
              }}
            />
            <FieldLabel htmlFor={`keep-${item.id}`} className="text-sm font-normal">
              {item.date} · {item.payeeRaw} · {formatDisplayMoney(currency, item.amount)}
            </FieldLabel>
          </li>
        ))}
      </ul>
      <WhatIsThis
        idPrefix="group"
        direction={included.some((item) => moneyDirection(item.amount) === "in") && included.every((item) => item.amount >= 0) ? "in" : direction}
        choice={choicesForDirection(direction, true).includes(choice) ? choice : defaultChoice(direction)}
        onChoice={(next) => {
          setChoice(next);
          setMerchantId((current) => merchantForChoice(next, current));
        }}
        choiceLocked={false}
        groupMode
        categoryId={categoryId}
        onCategoryId={setCategoryId}
        categoryLocked={false}
        allowEmptyCategory={false}
        transferAccountId={transferAccountId}
        onTransferAccountId={setTransferAccountId}
        transferLocked={false}
        lines={[]}
        onLines={() => undefined}
        amountsLocked
        currency={currency}
        totalMinor={total}
        categories={categories}
        accounts={transferOptions}
        merchants={merchants.map((merchant) => ({ id: merchant.id, label: merchant.name }))}
        merchantId={merchantId}
        onMerchantId={setMerchantId}
        payee={payee}
        suggestion={null}
      />
      <PayeeRuleField
        payee={payee}
        accountId={accountId}
        exceptIds={transactions.map((item) => item.id).join(",")}
        enabled={always}
        onEnabled={setAlways}
        match={ruleMatch}
        onMatch={setRuleMatch}
        pattern={rulePattern}
        onPattern={setRulePattern}
      />
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <FieldError>{error}</FieldError> : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        {notice ? (
          <Button type="button" onClick={() => onSaved(included[0]?.id ?? "")}>
            Done
          </Button>
        ) : (
          <Button type="submit" disabled={saveDisabled}>
            {saving ? "Saving" : "Save"}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}
