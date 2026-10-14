import { useQuery } from "@tanstack/react-query";
import { accountQuery, useSaveAccount } from "@/api/accounts";
import { bucketQuery } from "@/api/buckets";
import { mortgageTermsQuery } from "@/api/mortgage";
import { planQuery } from "@/api/recurring";
import { AccountForm } from "@/accounts/account-form";
import { accountLabel } from "@/accounts/label";
import { AccountImports } from "@/accounts/account-imports";
import { BucketForm } from "@/buckets/bucket-form";
import { LoadError, LoadingLine } from "@/editors/load-state";
import { useAccounts, useActiveBuckets, useBookCurrency, useCategories, useMerchants } from "@/editors/lookups";
import type { EditorInput } from "@/editors/editor-types";
import { PlanForm } from "@/recurring/plan-form";
import { TransactionEditor } from "@/transactions/transaction-editor";

type Finish = {
  onClose: () => void;
  onSaved: (id: string) => void;
};

export function TransactionRecord({ props, onClose, onSaved }: { props: EditorInput["transaction"] } & Finish) {
  return (
    <TransactionEditor
      id={props.id}
      rawLine={props.rawLine}
      initialAccountId={props.initialAccountId}
      unreadableItemKey={props.unreadableItemKey}
      groupIds={props.groupIds}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

export function AccountRecord({ props, onClose, onSaved }: { props: EditorInput["account"] } & Finish) {
  const currency = useBookCurrency();
  const account = useQuery(accountQuery(props.id));
  const isMortgage = account.data?.kind === "mortgage";
  const terms = useQuery(mortgageTermsQuery(props.id, isMortgage));
  const save = useSaveAccount();
  // A save can change the kind to mortgage. The terms then start to load. The form must stay on the screen until the
  // editor closes, thus the editor waits for the terms only before a save starts.
  const waitsForTerms = isMortgage && terms.isPending && (save.isIdle || save.isError);
  if (!currency.data || (props.id && account.isPending) || waitsForTerms) {
    return <LoadingLine label="Loading the account." />;
  }
  if (currency.isError || account.isError || terms.isError) {
    return <LoadError label="The account did not load." onRetry={() => void Promise.all([account.refetch(), terms.refetch()])} />;
  }
  return (
    <AccountForm
      currency={currency.data}
      account={props.id ? (account.data ?? null) : null}
      terms={terms.data ?? null}
      initialName={props.name}
      save={save}
      onClose={onClose}
      onSaved={onSaved}
      below={
        props.id && account.data ? (
          <AccountImports accountId={props.id} accountName={accountLabel(account.data)} currency={currency.data} />
        ) : null
      }
    />
  );
}

export function BucketRecord({ props, onClose, onSaved }: { props: EditorInput["bucket"] } & Finish) {
  const currency = useBookCurrency();
  const board = useActiveBuckets();
  const bucket = useQuery(bucketQuery(props.id));
  if (!currency.data || board.isPending || (props.id && bucket.isPending)) {
    return <LoadingLine label="Loading the bucket." />;
  }
  if (currency.isError || board.isError || bucket.isError || !board.data) {
    return <LoadError label="The bucket did not load." onRetry={() => void bucket.refetch()} />;
  }
  const suggestedPriority = board.data.items.reduce((max, item) => Math.max(max, item.priority), 0) + 1;
  return (
    <BucketForm
      currency={currency.data}
      draft={props.id ? (bucket.data ?? "new") : "new"}
      nextColor={board.data.nextColor}
      suggestedPriority={bucket.data?.priority ?? suggestedPriority}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

export function PlanRecord({ props, onClose, onSaved }: { props: EditorInput["plan"] } & Finish) {
  const currency = useBookCurrency();
  const accounts = useAccounts();
  const categories = useCategories();
  const merchants = useMerchants();
  const plan = useQuery(planQuery(props.id));
  if (!currency.data || accounts.isPending || categories.isPending || merchants.isPending || (props.id && plan.isPending)) {
    return <LoadingLine label="Loading recurring." />;
  }
  if (currency.isError || accounts.isError || categories.isError || merchants.isError || plan.isError || !accounts.data || !categories.data || !merchants.data) {
    return <LoadError label="Recurring did not load." onRetry={() => void plan.refetch()} />;
  }
  const draft = props.id ? (plan.data ?? "new") : (props.seed ?? "new");
  return (
    <PlanForm
      key={props.id ?? props.seed?.name ?? "new"}
      currency={currency.data}
      draft={draft}
      accounts={accounts.data}
      categories={categories.data}
      merchants={merchants.data}
      initialKind={props.kind}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
