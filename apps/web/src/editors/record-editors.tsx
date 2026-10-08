import {
  accountSchema,
  bucketSchema,
  categoryGroupSchema,
  categorySchema,
  merchantSchema,
  planSchema,
  ruleSchema,
  tagSchema,
} from "@num/shared";
import { useQueryClient } from "@tanstack/react-query";
import { AccountForm } from "@/accounts/account-form";
import { AccountImports } from "@/accounts/account-imports";
import { BucketForm } from "@/buckets/bucket-form";
import { LoadError, LoadingLine } from "@/editors/load-state";
import {
  useAccounts,
  useActiveBuckets,
  useBookCurrency,
  useCategories,
  useGroups,
  useMerchants,
  useRecord,
} from "@/editors/lookups";
import type { EditorInput } from "@/editors/editor-types";
import { PlanForm } from "@/recurring/plan-form";
import { apiRequest } from "@/request";
import { CategoryForm } from "@/settings/category-form";
import { categoryError, tagError } from "@/settings/format";
import { MerchantForm } from "@/settings/merchant-form";
import { NameForm } from "@/settings/name-form";
import { RuleForm } from "@/settings/rule-form";
import { TransactionEditor } from "@/transactions/transaction-editor";

type Finish = {
  onClose: () => void;
  onSaved: (id: string) => void;
};

function useSaved(keys: string[][], onSaved: (id: string) => void) {
  const queryClient = useQueryClient();
  return (id: string) => {
    for (const key of keys) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
    onSaved(id);
  };
}

export function TransactionRecord({ props, onClose, onSaved }: { props: EditorInput["transaction"] } & Finish) {
  return (
    <TransactionEditor
      id={props.id}
      rawLine={props.rawLine}
      initialAccountId={props.initialAccountId}
      groupIds={props.groupIds}
      queueIds={props.queueIds}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

export function AccountRecord({ props, onClose, onSaved }: { props: EditorInput["account"] } & Finish) {
  const currency = useBookCurrency();
  const account = useRecord("account", props.id, `/api/accounts/${props.id ?? ""}`, accountSchema);
  const save = useSaved([["accounts"], ["account"]], onSaved);
  if (!currency.data || (props.id && account.isPending)) {
    return <LoadingLine label="Loading the account." />;
  }
  if (currency.isError || account.isError) {
    return <LoadError label="The account did not load." onRetry={() => void account.refetch()} />;
  }
  return (
    <>
      <AccountForm
        currency={currency.data}
        account={props.id ? (account.data ?? null) : null}
        initialName={props.name}
        onClose={onClose}
        onSaved={save}
      />
      {props.id && account.data ? (
        <AccountImports accountId={props.id} accountName={account.data.name} currency={currency.data} />
      ) : null}
    </>
  );
}

export function CategoryRecord({ props, onClose, onSaved }: { props: EditorInput["category"] } & Finish) {
  const groups = useGroups();
  const category = useRecord("category", props.id, `/api/categories/${props.id ?? ""}`, categorySchema);
  const save = useSaved([["categories"], ["category"]], onSaved);
  if (groups.isPending || (props.id && category.isPending)) {
    return <LoadingLine label="Loading the category." />;
  }
  if (groups.isError || category.isError || !groups.data) {
    return <LoadError label="The category did not load." onRetry={() => void category.refetch()} />;
  }
  return (
    <CategoryForm
      category={props.id ? (category.data ?? null) : null}
      groups={groups.data}
      initialName={props.name}
      initialKind={props.kind}
      onClose={onClose}
      onSaved={save}
    />
  );
}

export function GroupRecord({ props, onClose, onSaved }: { props: EditorInput["group"] } & Finish) {
  const queryClient = useQueryClient();
  const group = useRecord("category-group", props.id, `/api/category-groups/${props.id ?? ""}`, categoryGroupSchema);
  if (props.id && group.isPending) {
    return <LoadingLine label="Loading the group." />;
  }
  if (group.isError) {
    return <LoadError label="The group did not load." onRetry={() => void group.refetch()} />;
  }
  return (
    <NameForm
      title={props.id ? "Rename group" : "New group"}
      description="A group only organizes categories."
      label="Name"
      submitLabel={props.id ? "Save group" : "Add group"}
      savingLabel="Saving group"
      initialName={group.data?.name ?? props.name ?? ""}
      onClose={onClose}
      onSubmit={async (name) => {
        const result = await apiRequest(props.id ? `/api/category-groups/${props.id}` : "/api/category-groups", categoryGroupSchema, {
          method: props.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!result.ok) {
          return categoryError(result.code);
        }
        await queryClient.invalidateQueries({ queryKey: ["category-groups"] });
        await queryClient.invalidateQueries({ queryKey: ["categories"] });
        onSaved(result.data.id);
        return null;
      }}
    />
  );
}

export function TagRecord({ props, onClose, onSaved }: { props: EditorInput["tag"] } & Finish) {
  const queryClient = useQueryClient();
  const tag = useRecord("tag", props.id, `/api/tags/${props.id ?? ""}`, tagSchema);
  if (props.id && tag.isPending) {
    return <LoadingLine label="Loading the tag." />;
  }
  if (tag.isError) {
    return <LoadError label="The tag did not load." onRetry={() => void tag.refetch()} />;
  }
  return (
    <NameForm
      title={props.id ? "Rename tag" : "New tag"}
      description="Use a tag for a trip or a project."
      label="Name"
      submitLabel={props.id ? "Save tag" : "Add tag"}
      savingLabel="Saving tag"
      initialName={tag.data?.name ?? props.name ?? ""}
      onClose={onClose}
      onSubmit={async (name) => {
        const result = await apiRequest(props.id ? `/api/tags/${props.id}` : "/api/tags", tagSchema, {
          method: props.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!result.ok) {
          return tagError(result.code);
        }
        await queryClient.invalidateQueries({ queryKey: ["tags"] });
        onSaved(result.data.id);
        return null;
      }}
    />
  );
}

export function MerchantRecord({ props, onClose, onSaved }: { props: EditorInput["merchant"] } & Finish) {
  const categories = useCategories();
  const merchant = useRecord("merchant", props.id, `/api/merchants/${props.id ?? ""}`, merchantSchema);
  const save = useSaved([["merchants"], ["merchant"]], onSaved);
  if (categories.isPending || (props.id && merchant.isPending)) {
    return <LoadingLine label="Loading the merchant." />;
  }
  if (categories.isError || merchant.isError || !categories.data) {
    return <LoadError label="The merchant did not load." onRetry={() => void merchant.refetch()} />;
  }
  return (
    <MerchantForm
      merchant={props.id ? (merchant.data ?? null) : null}
      initialName={props.name}
      categories={categories.data}
      onClose={onClose}
      onSaved={save}
    />
  );
}

export function RuleRecord({ props, onClose, onSaved }: { props: EditorInput["rule"] } & Finish) {
  const accounts = useAccounts();
  const categories = useCategories();
  const merchants = useMerchants();
  const rule = useRecord("rule", props.id, `/api/rules/${props.id ?? ""}`, ruleSchema);
  const save = useSaved([["rules"], ["rule"]], onSaved);
  if (accounts.isPending || categories.isPending || merchants.isPending || (props.id && rule.isPending)) {
    return <LoadingLine label="Loading the rule." />;
  }
  if (accounts.isError || categories.isError || merchants.isError || rule.isError || !accounts.data || !categories.data || !merchants.data) {
    return <LoadError label="The rule did not load." onRetry={() => void rule.refetch()} />;
  }
  return (
    <RuleForm
      rule={props.id ? (rule.data ?? null) : null}
      accounts={accounts.data}
      categories={categories.data}
      merchants={merchants.data}
      onClose={onClose}
      onSaved={save}
    />
  );
}

export function BucketRecord({ props, onClose, onSaved }: { props: EditorInput["bucket"] } & Finish) {
  const currency = useBookCurrency();
  const board = useActiveBuckets();
  const bucket = useRecord("bucket", props.id, `/api/buckets/${props.id ?? ""}`, bucketSchema);
  const save = useSaved([["buckets"], ["bucket"]], onSaved);
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
      onSaved={save}
    />
  );
}

export function PlanRecord({ props, onClose, onSaved }: { props: EditorInput["plan"] } & Finish) {
  const currency = useBookCurrency();
  const accounts = useAccounts();
  const categories = useCategories();
  const merchants = useMerchants();
  const plan = useRecord("plan", props.id, `/api/recurring/${props.id ?? ""}`, planSchema);
  const save = useSaved([["plans"], ["plan"], ["recurring-signals"], ["occurrences"]], onSaved);
  if (!currency.data || accounts.isPending || categories.isPending || merchants.isPending || (props.id && plan.isPending)) {
    return <LoadingLine label="Loading the plan." />;
  }
  if (currency.isError || accounts.isError || categories.isError || merchants.isError || plan.isError || !accounts.data || !categories.data || !merchants.data) {
    return <LoadError label="The plan did not load." onRetry={() => void plan.refetch()} />;
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
      onClose={onClose}
      onSaved={save}
    />
  );
}
