import { categoryGroupSchema, tagSchema, type Category, type CategoryKind } from "@num/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { AccountForm } from "@/accounts/account-form";
import { useBookCurrency, useGroups } from "@/editors/lookups";
import { apiRequest } from "@/request";
import { CategoryForm } from "@/settings/category-form";
import { categoryError, tagError } from "@/settings/format";
import { MerchantForm } from "@/settings/merchant-form";
import { NameForm } from "@/settings/name-form";

type Done = (id: string | null) => void;

export function InlineCategory({ name, kind, depth, onDone }: { name: string; kind: CategoryKind; depth: number; onDone: Done }) {
  const groups = useGroups();
  const queryClient = useQueryClient();
  return (
    <CategoryForm
      inline
      depth={depth}
      category={null}
      groups={groups.data ?? []}
      initialName={name}
      initialKind={kind}
      onClose={() => onDone(null)}
      onSaved={(id) => {
        void queryClient.invalidateQueries({ queryKey: ["categories"] });
        onDone(id);
      }}
    />
  );
}

export function InlineAccount({ name, onDone }: { name: string; onDone: Done }) {
  const currency = useBookCurrency();
  const queryClient = useQueryClient();
  if (!currency.data) {
    return <p className="text-sm text-muted-foreground">Loading the account form.</p>;
  }
  return (
    <AccountForm
      inline
      currency={currency.data}
      account={null}
      initialName={name}
      onClose={() => onDone(null)}
      onSaved={(id) => {
        void queryClient.invalidateQueries({ queryKey: ["accounts"] });
        onDone(id);
      }}
    />
  );
}

export function InlineMerchant({ name, depth, categories, onDone }: { name: string; depth: number; categories: Category[]; onDone: Done }) {
  const queryClient = useQueryClient();
  return (
    <MerchantForm
      inline
      depth={depth}
      merchant={null}
      initialName={name}
      categories={categories}
      onClose={() => onDone(null)}
      onSaved={(id) => {
        void queryClient.invalidateQueries({ queryKey: ["merchants"] });
        onDone(id);
      }}
    />
  );
}

export function InlineNamed({
  noun,
  title,
  description,
  name,
  path,
  idPrefix,
  onDone,
}: {
  noun: "group" | "tag";
  title: string;
  description: string;
  name: string;
  path: string;
  idPrefix: string;
  onDone: Done;
}) {
  const queryClient = useQueryClient();
  const created = useRef<string | null>(null);
  const schema = noun === "tag" ? tagSchema : categoryGroupSchema;
  return (
    <NameForm
      inline
      idPrefix={idPrefix}
      title={title}
      description={description}
      label="Name"
      submitLabel={noun === "tag" ? "Add tag" : "Add group"}
      savingLabel={noun === "tag" ? "Saving tag" : "Saving group"}
      initialName={name}
      onClose={() => onDone(created.current)}
      onSubmit={async (value) => {
        const result = await apiRequest(path, schema, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: value }),
        });
        if (!result.ok) {
          return noun === "tag" ? tagError(result.code) : categoryError(result.code);
        }
        created.current = result.data.id;
        await queryClient.invalidateQueries({ queryKey: [noun === "tag" ? "tags" : "category-groups"] });
        return null;
      }}
    />
  );
}
