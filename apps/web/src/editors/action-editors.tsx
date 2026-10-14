import { useQuery } from "@tanstack/react-query";
import { accountQuery } from "@/api/accounts";
import { bucketQuery } from "@/api/buckets";
import { ImportForm } from "@/accounts/import-dialog";
import { ReconcileDialog } from "@/accounts/reconcile-dialog";
import { localAsOf } from "@/as-of";
import { AssignMoney } from "@/buckets/assign-money";
import { FundPaycheck } from "@/buckets/fund-paycheck";
import { MoveMoney } from "@/buckets/move-money";
import type { EditorInput } from "@/editors/editor-types";
import { useActiveBuckets, useBookCurrency } from "@/editors/lookups";
import { LoadError, LoadingLine } from "@/editors/load-state";

type Finish = { onClose: () => void; onSaved: (id: string) => void };

export function ImportEditor({ props, onClose, onSaved }: { props: EditorInput["import"] } & Finish) {
  const account = useQuery(accountQuery(props.accountId));
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
      onImported={() => onSaved("ok")}
    />
  );
}

export function ReconcileEditor({ props, onClose }: { props: EditorInput["reconcile"] } & Pick<Finish, "onClose">) {
  const currency = useBookCurrency();
  const account = useQuery(accountQuery(props.accountId));
  if (!currency.data || account.isPending) {
    return <LoadingLine label="Loading the account." />;
  }
  if (currency.isError || account.isError || !account.data) {
    return <LoadError label="The account did not load." onRetry={() => void account.refetch()} />;
  }
  return <ReconcileDialog account={account.data} currency={currency.data} onClose={onClose} />;
}

export function FundEditor({ props, onSaved }: { props: EditorInput["fundPaycheck"] } & Finish) {
  const currency = useBookCurrency();
  if (!currency.data) {
    return <LoadingLine label="Loading the paycheck." />;
  }
  return (
    <FundPaycheck
      currency={currency.data}
      asOf={localAsOf()}
      incomeTransactionId={props.incomeTransactionId}
      onSaved={() => onSaved("ok")}
    />
  );
}

export function AssignEditor({ props, onClose, onSaved }: { props: EditorInput["assignMoney"] } & Finish) {
  const currency = useBookCurrency();
  const bucket = useQuery(bucketQuery(props.bucketId));
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
      onSaved={() => onSaved("ok")}
    />
  );
}

export function MoveEditor({ props, onClose, onSaved }: { props: EditorInput["moveMoney"] } & Finish) {
  const currency = useBookCurrency();
  const board = useActiveBuckets();
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
      onSaved={() => onSaved("ok")}
    />
  );
}
