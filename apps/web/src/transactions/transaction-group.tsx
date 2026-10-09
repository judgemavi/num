import {
  choicesForDirection,
  defaultChoice,
  inboxGroupApplyResultSchema,
  merchantForChoice,
  moneyDirection,
  transactionSchema,
  type Account,
  type Category,
  type Merchant,
  type Transaction,
  type WhatChoice,
} from "@num/shared";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { accountLabel } from "@/accounts/label";
import { LoadError, LoadingLine } from "@/editors/load-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogBody, DialogForm } from "@/editors/form-chrome";
import { FieldError, FieldLabel } from "@/components/ui/field";
import { apiRequest } from "@/request";
import { formatMoney as formatDisplayMoney } from "@/money";
import { transactionError } from "@/transactions/format";
import { WhatIsThis } from "@/transactions/what-is-this";

type GroupEditorProps = {
  ids: string[];
  currency: string;
  accounts: Account[];
  categories: Category[];
  merchants: Merchant[];
  onSaved: (id: string) => void;
};

export function GroupEditor({ ids, currency, accounts, categories, merchants, onSaved }: GroupEditorProps) {
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
      onSaved={async (id) => {
        await queryClient.invalidateQueries({ queryKey: ["transactions"] });
        await queryClient.invalidateQueries({ queryKey: ["transaction"] });
        await queryClient.invalidateQueries({ queryKey: ["needs-review"] });
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
  onSaved,
}: {
  currency: string;
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  merchants: Merchant[];
  onSaved: (id: string) => void;
}) {
  const direction = transactions.filter((item) => item.amount > 0).length > transactions.filter((item) => item.amount < 0).length ? "in" : "out";
  const [excluded, setExcluded] = useState<string[]>([]);
  const [choice, setChoice] = useState<WhatChoice>(defaultChoice(direction));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [transferAccountId, setTransferAccountId] = useState<string | null>(null);
  const [merchantId, setMerchantId] = useState<string | null>(null);
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
    .map((account) => ({ id: account.id, label: accountLabel(account) }));
  const archivedAccounts = accounts
    .filter((account) => account.archivedAt !== null && account.id !== accountId)
    .map((account) => ({ id: account.id, label: accountLabel(account) }));
  const merchantOptions = merchants
    .filter((merchant) => merchant.archivedAt === null || merchant.id === merchantId)
    .map((merchant) => ({ id: merchant.id, label: merchant.name }));
  const archivedMerchants = merchants.filter((merchant) => merchant.archivedAt).map((merchant) => ({ id: merchant.id, label: merchant.name }));
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
    const result = await apiRequest("/api/transactions/group", inboxGroupApplyResultSchema, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountId,
        transactionIds: transactions.map((item) => item.id),
        excludedIds: excluded,
        categoryId: choice === "transfer" ? null : categoryId,
        transferAccountId: choice === "transfer" ? transferAccountId : null,
        merchantId: choice === "transfer" ? null : merchantId,
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
    <DialogForm
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
      <DialogBody>
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
        archivedAccounts={archivedAccounts}
        merchants={merchantOptions}
        archivedMerchants={archivedMerchants}
        merchantId={merchantId}
        onMerchantId={setMerchantId}
        payee={payee}
        suggestion={null}
      />
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <FieldError>{error}</FieldError> : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
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
    </DialogForm>
  );
}
