import type { CategoryKind } from "@num/shared";
import { AccountForm } from "@/accounts/account-form";
import { useSaveAccount } from "@/api/accounts";
import { errorCode } from "@/api/client";
import { useSaveTag } from "@/api/tags";
import { useBookCurrency, useGroups } from "@/editors/lookups";
import { CategoryForm } from "@/settings/category-form";
import { tagError } from "@/settings/format";
import { MerchantForm } from "@/settings/merchant-form";
import { NameForm } from "@/settings/name-form";

type Done = (id: string | null) => void;

export function InlineAccount({ name, onDone }: { name: string; onDone: Done }) {
  const currency = useBookCurrency();
  const save = useSaveAccount();
  if (!currency.data) {
    return <p className="text-sm text-muted-foreground">Loading the account form.</p>;
  }
  return (
    <AccountForm
      inline
      currency={currency.data}
      account={null}
      initialName={name}
      save={save}
      onClose={() => onDone(null)}
      onSaved={onDone}
    />
  );
}

export function InlineCategory({ name, kind, depth, onDone }: { name: string; kind: CategoryKind; depth: number; onDone: Done }) {
  const groups = useGroups();
  return (
    <CategoryForm
      inline
      depth={depth}
      category={null}
      groups={groups.data ?? []}
      initialName={name}
      initialKind={kind}
      onClose={() => onDone(null)}
      onSaved={onDone}
    />
  );
}

export function InlineMerchant({ name, depth, onDone }: { name: string; depth: number; onDone: Done }) {
  return <MerchantForm inline depth={depth} merchant={null} initialName={name} onClose={() => onDone(null)} onSaved={onDone} />;
}

export function InlineTag({ name, idPrefix, onDone }: { name: string; idPrefix: string; onDone: Done }) {
  const save = useSaveTag();
  return (
    <NameForm
      inline
      idPrefix={idPrefix}
      title="New tag"
      description="Use a tag for a trip or a project."
      label="Name"
      submitLabel="Add tag"
      savingLabel="Saving tag"
      initialName={name}
      pending={save.isPending}
      error={save.error ? tagError(errorCode(save.error)) : null}
      onClose={() => onDone(null)}
      onSubmit={(value) => save.mutate({ id: null, name: value }, { onSuccess: (saved) => onDone(saved.id) })}
    />
  );
}
