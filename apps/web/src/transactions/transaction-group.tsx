import {
  choicesForDirection,
  defaultChoice,
  merchantForChoice,
  moneyDirection,
  type Transaction,
} from "@num/shared";
import { useSuspenseQueries } from "@tanstack/react-query";
import { useState } from "react";
import { errorCode } from "@/api/client";
import { useApplyGroup } from "@/api/review";
import { transactionQuery } from "@/api/transactions";
import { useEditorFrame } from "@/editors/editor-api";
import { useBookCurrency } from "@/editors/lookups";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogBody, DialogForm } from "@/editors/form-chrome";
import { FieldError, FieldLabel } from "@/components/ui/field";
import { formatMoney as formatDisplayMoney } from "@/money";
import { transactionError } from "@/transactions/format";
import { WhatIsThis } from "@/transactions/what-is-this";

export function GroupEditor({ ids }: { ids: string[] }) {
  const transactions = useSuspenseQueries({
    queries: ids.map((id) => transactionQuery(id)),
    combine: (results) => results.map((result) => result.data),
  });
  return <GroupForm transactions={transactions} />;
}

function GroupForm({ transactions }: { transactions: Transaction[] }) {
  const { close } = useEditorFrame();
  const currency = useBookCurrency();
  const direction = transactions.filter((item) => item.amount > 0).length > transactions.filter((item) => item.amount < 0).length ? "in" : "out";
  const [excluded, setExcluded] = useState<string[]>([]);
  const [choice, setChoice] = useState(defaultChoice(direction));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [transferAccountId, setTransferAccountId] = useState<string | null>(null);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const apply = useApplyGroup();
  const saving = apply.isPending;
  const error = invalid ?? (apply.error ? transactionError(errorCode(apply.error)) : null);
  const notice = apply.data && apply.data.skipped.length > 0 ? `Applied to ${apply.data.applied} · skipped ${apply.data.skipped.length}` : null;
  const included = transactions.filter((item) => !excluded.includes(item.id));
  const total = included.reduce((sum, item) => sum + item.amount, 0);
  const sameSign = included.every((item) => item.amount === 0 || Math.sign(item.amount) === Math.sign(total || item.amount));
  const shownTotal = sameSign ? Math.abs(total) : total;
  const payee = transactions[0]?.payeeRaw ?? "";
  const accountId = included[0]?.accountId ?? transactions[0]?.accountId ?? "";
  const saveDisabled = saving || included.length === 0 || (choice === "transfer" && !transferAccountId);

  function save() {
    if (included.length === 0) {
      return;
    }
    if (choice !== "transfer" && !categoryId) {
      setInvalid("Choose a category.");
      return;
    }
    setInvalid(null);
    apply.mutate(
      {
        accountId,
        transactionIds: transactions.map((item) => item.id),
        excludedIds: excluded,
        categoryId: choice === "transfer" ? null : categoryId,
        transferAccountId: choice === "transfer" ? transferAccountId : null,
        merchantId: choice === "transfer" ? null : merchantId,
      },
      {
        onSuccess: (result) => {
          if (result.skipped.length === 0) {
            close(included[0]?.id ?? "");
          }
        },
      },
    );
  }

  return (
    <DialogForm
      onSubmit={(event) => {
        event.preventDefault();
        save();
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
        totalMinor={total}
        accountId={accountId}
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
          <Button type="button" onClick={() => close(included[0]?.id ?? "")}>
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
