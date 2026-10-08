import { accountSchema, bucketSchema } from "@num/shared";
import { useQueryClient } from "@tanstack/react-query";
import { ImportForm } from "@/accounts/import-dialog";
import { ReconcileDialog } from "@/accounts/reconcile-dialog";
import { localAsOf } from "@/as-of";
import { AssignMoney } from "@/buckets/assign-money";
import { FundPaycheck } from "@/buckets/fund-paycheck";
import { MoveMoney } from "@/buckets/move-money";
import type { EditorInput } from "@/editors/editor-types";
import { useActiveBuckets, useBookCurrency, useRecord } from "@/editors/lookups";
import { LoadError, LoadingLine } from "@/editors/load-state";

type Finish = { onClose: () => void; onSaved: (id: string) => void };

function useRefresh(keys: string[][]) {
  const queryClient = useQueryClient();
  return async () => {
    for (const key of keys) {
      await queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

export function ImportEditor({ props, onClose, onSaved }: { props: EditorInput["import"] } & Finish) {
  const account = useRecord("account", props.accountId, `/api/accounts/${props.accountId ?? ""}`, accountSchema);
  const refresh = useRefresh([["imports"], ["accounts"], ["account"], ["transactions"], ["inbox"]]);
  if (props.accountId && account.isPending) {
    return <LoadingLine label="Loading the account." />;
  }
  if (account.isError) {
    return <LoadError label="The account did not load." onRetry={() => void account.refetch()} />;
  }
  return (
    <ImportForm
      key={props.accountId ?? "none"}
      account={props.accountId ? (account.data ?? null) : null}
      onClose={onClose}
      onImported={() => {
        void refresh().then(() => onSaved("ok"));
      }}
    />
  );
}

export function ReconcileEditor({ props, onClose }: { props: EditorInput["reconcile"] } & Pick<Finish, "onClose">) {
  const currency = useBookCurrency();
  const account = useRecord("account", props.accountId, `/api/accounts/${props.accountId}`, accountSchema);
  if (!currency.data || account.isPending) {
    return <LoadingLine label="Loading the account." />;
  }
  if (currency.isError || account.isError || !account.data) {
    return <LoadError label="The account did not load." onRetry={() => void account.refetch()} />;
  }
  return <ReconcileDialog accountId={props.accountId} currency={currency.data} kind={account.data.kind} onClose={onClose} />;
}

export function FundEditor({ props, onClose, onSaved }: { props: EditorInput["fundPaycheck"] } & Finish) {
  const currency = useBookCurrency();
  const refresh = useRefresh([["buckets"], ["funding-position"], ["funding-paychecks"], ["funding-proposal"], ["funding-runs"], ["inbox"]]);
  if (!currency.data) {
    return <LoadingLine label="Loading the paycheck." />;
  }
  return (
    <FundPaycheck
      currency={currency.data}
      asOf={localAsOf()}
      incomeTransactionId={props.incomeTransactionId}
      onClose={onClose}
      onSaved={() => {
        void refresh().then(() => onSaved("ok"));
      }}
    />
  );
}

export function AssignEditor({ props, onClose, onSaved }: { props: EditorInput["assignMoney"] } & Finish) {
  const currency = useBookCurrency();
  const bucket = useRecord("bucket", props.bucketId, `/api/buckets/${props.bucketId}`, bucketSchema);
  const refresh = useRefresh([["buckets"], ["bucket-events"], ["funding-position"]]);
  if (!currency.data || bucket.isPending) {
    return <LoadingLine label="Loading the bucket." />;
  }
  if (currency.isError || bucket.isError || !bucket.data) {
    return <LoadError label="The bucket did not load." onRetry={() => void bucket.refetch()} />;
  }
  return (
    <AssignMoney
      currency={currency.data}
      bucket={bucket.data}
      kind={props.kind}
      onClose={onClose}
      onSaved={() => {
        void refresh().then(() => onSaved("ok"));
      }}
    />
  );
}

export function MoveEditor({ props, onClose, onSaved }: { props: EditorInput["moveMoney"] } & Finish) {
  const currency = useBookCurrency();
  const board = useActiveBuckets();
  const refresh = useRefresh([["buckets"], ["bucket-events"], ["funding-position"]]);
  if (!currency.data || board.isPending) {
    return <LoadingLine label="Loading buckets." />;
  }
  if (currency.isError || board.isError || !board.data) {
    return <LoadError label="The buckets did not load." onRetry={() => void board.refetch()} />;
  }
  return (
    <MoveMoney
      currency={currency.data}
      buckets={board.data.items}
      fromId={props.fromId}
      onClose={onClose}
      onSaved={() => {
        void refresh().then(() => onSaved("ok"));
      }}
    />
  );
}
