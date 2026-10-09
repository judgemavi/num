import {
  merchantSchema,
  occurrenceLinkSchema,
  planSchema,
  transactionListSchema,
} from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { importCountText, unreadableLabel } from "@/accounts/import-format";
import type { EditorInput } from "@/editors/editor-types";
import { useMerchants, useRecord } from "@/editors/lookups";
import { LoadError, LoadingLine } from "@/editors/load-state";
import { planError } from "@/recurring/format";
import { formatDate } from "@/transactions/format";
import { SkipNext } from "@/recurring/skip-next";
import { apiRequest } from "@/request";
import { MergeDialog } from "@/settings/merge-dialog";
import { OptionCombobox } from "@/transactions/option-combobox";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogBody, DialogForm, DialogPanel } from "@/editors/form-chrome";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Finish = { onClose: () => void; onSaved: (id: string) => void };

function useRefresh(keys: string[][]) {
  const queryClient = useQueryClient();
  return async () => {
    for (const key of keys) {
      await queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

export function ImportInfoEditor({ props }: { props: EditorInput["importInfo"] }) {
  return (
    <DialogPanel>
      <DialogHeader>
        <DialogTitle>Import detail</DialogTitle>
        <DialogDescription>
          {props.filename ?? "Statement"} · {importCountText(props.counts)}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
      {props.unreadable.length > 0 ? (
        <ul className="grid gap-3">
          {props.unreadable.map((row) => (
            <li key={`${row.line}-${row.raw}`} className="grid gap-1 border-t pt-3 text-sm">
              <p className="font-semibold">
                Line {row.line}. {unreadableLabel(row.reason)}
              </p>
              <p className="break-all text-muted-foreground">{row.raw}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Every row was read.</p>
      )}
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button">Close</Button>
        </DialogClose>
      </DialogFooter>
    </DialogPanel>
  );
}

export function MergeEditor({ props, onSaved }: { props: EditorInput["mergeMerchant"]; onSaved: (id: string) => void }) {
  const merchants = useMerchants();
  const merchant = useRecord("merchant", props.merchantId, `/api/merchants/${props.merchantId}`, merchantSchema);
  const refresh = useRefresh([["merchants"], ["transactions"]]);
  if (merchants.isPending || merchant.isPending) {
    return <LoadingLine label="Loading the merchant." />;
  }
  if (merchants.isError || merchant.isError || !merchants.data || !merchant.data) {
    return <LoadError label="The merchant did not load." onRetry={() => void merchant.refetch()} />;
  }
  return (
    <MergeDialog
      source={merchant.data}
      merchants={merchants.data}
      onMerged={() => {
        void refresh().then(() => onSaved("ok"));
      }}
    />
  );
}

export function SkipNextEditor({ props, onSaved }: { props: EditorInput["skipNext"]; onSaved: (id: string) => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const plan = useRecord("plan", props.planId, `/api/recurring/${props.planId}`, planSchema);
  const refresh = useRefresh([["plans"], ["occurrences"], ["recurring-signals"], ["recurring-sync"]]);
  if (plan.isPending) {
    return <LoadingLine label="Loading recurring." />;
  }
  if (plan.isError || !plan.data) {
    return <LoadError label="Recurring did not load." onRetry={() => void plan.refetch()} />;
  }
  return (
    <SkipNext
      plan={plan.data}
      reason={reason}
      asOf={props.asOf}
      error={error}
      onReason={setReason}
      onDone={() => {
        void refresh().then(() => onSaved("ok"));
      }}
      onError={setError}
    />
  );
}

export function SkipOccurrenceEditor({ props, onSaved }: { props: EditorInput["skipOccurrence"]; onSaved: (id: string) => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const refresh = useRefresh([["occurrences"], ["recurring-signals"], ["recurring-sync"]]);

  async function skip() {
    if (reason.trim().length === 0) {
      return;
    }
    const result = await apiRequest(`/api/recurring/${props.planId}/occurrences/${props.dueDate}/skip`, occurrenceLinkSchema, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    if (!result.ok) {
      setError(planError(result.code));
      return;
    }
    await refresh();
    onSaved("ok");
  }

  return (
    <DialogForm
      onSubmit={(event) => {
        event.preventDefault();
        void skip();
      }}
    >
      <DialogHeader>
        <DialogTitle>Skip this occurrence</DialogTitle>
        <DialogDescription>Tell why this one will not happen. You can restore it later.</DialogDescription>
      </DialogHeader>
      <DialogBody>
      <Field>
        <FieldLabel htmlFor="skip-reason">Reason</FieldLabel>
        <Input id="skip-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      {reason.trim().length === 0 ? <FieldError>Enter a reason.</FieldError> : null}
      {error ? <FieldError>{error}</FieldError> : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={reason.trim().length === 0}>
          Skip
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}

export function LinkOccurrenceEditor({ props, onSaved }: { props: EditorInput["linkOccurrence"] } & Finish) {
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useRefresh([["occurrences"], ["recurring-signals"], ["recurring-sync"]]);
  const candidates = useQuery({
    queryKey: ["plan-transactions", props.accountId, props.dueDate],
    queryFn: async () => {
      const params = new URLSearchParams({ accountId: props.accountId, pageSize: "200" });
      const result = await apiRequest(`/api/transactions?${params.toString()}`, transactionListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.items;
    },
  });

  async function link() {
    if (!transactionId) {
      return;
    }
    const result = await apiRequest(`/api/recurring/${props.planId}/occurrences/${props.dueDate}/link`, occurrenceLinkSchema, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transactionId }),
    });
    if (!result.ok) {
      setError(planError(result.code));
      return;
    }
    await refresh();
    onSaved("ok");
  }

  return (
    <DialogForm
      onSubmit={(event) => {
        event.preventDefault();
        void link();
      }}
    >
      <DialogHeader>
        <DialogTitle>Link a transaction</DialogTitle>
        <DialogDescription>Choose a transaction on this account.</DialogDescription>
      </DialogHeader>
      <DialogBody>
      <Field>
        <FieldLabel htmlFor="link-transaction">Transaction</FieldLabel>
        <OptionCombobox
          id="link-transaction"
          value={transactionId}
          options={(candidates.data ?? []).map((item) => ({
            id: item.id,
            label: `${formatDate(item.date)} · ${item.payeeRaw}`,
          }))}
          placeholder="Choose a transaction"
          onChange={setTransactionId}
        />
      </Field>
      {error ? <FieldError>{error}</FieldError> : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!transactionId}>
          Link
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}

