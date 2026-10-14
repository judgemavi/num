import { useQuery } from "@tanstack/react-query";
import { categoryQuery, groupQuery, useSaveGroup } from "@/api/categories";
import { errorCode } from "@/api/client";
import { merchantQuery } from "@/api/merchants";
import { tagQuery, useSaveTag } from "@/api/tags";
import { LoadError, LoadingLine } from "@/editors/load-state";
import { useGroups, useMerchants } from "@/editors/lookups";
import type { EditorInput } from "@/editors/editor-types";
import { CategoryForm } from "@/settings/category-form";
import { categoryError, tagError } from "@/settings/format";
import { MerchantForm } from "@/settings/merchant-form";
import { MergeDialog } from "@/settings/merge-dialog";
import { NameForm } from "@/settings/name-form";

type Finish = {
  onClose: () => void;
  onSaved: (id: string) => void;
};

export function CategoryRecord({ props, onClose, onSaved }: { props: EditorInput["category"] } & Finish) {
  const groups = useGroups();
  const category = useQuery(categoryQuery(props.id));
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
      onSaved={onSaved}
    />
  );
}

export function GroupRecord({ props, onClose, onSaved }: { props: EditorInput["group"] } & Finish) {
  const group = useQuery(groupQuery(props.id));
  const save = useSaveGroup();
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
      pending={save.isPending}
      error={save.error ? categoryError(errorCode(save.error)) : null}
      onClose={onClose}
      onSubmit={(name) => save.mutate({ id: props.id, name }, { onSuccess: (saved) => onSaved(saved.id) })}
    />
  );
}

export function TagRecord({ props, onClose, onSaved }: { props: EditorInput["tag"] } & Finish) {
  const tag = useQuery(tagQuery(props.id));
  const save = useSaveTag();
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
      pending={save.isPending}
      error={save.error ? tagError(errorCode(save.error)) : null}
      onClose={onClose}
      onSubmit={(name) => save.mutate({ id: props.id, name }, { onSuccess: (saved) => onSaved(saved.id) })}
    />
  );
}

export function MerchantRecord({ props, onClose, onSaved }: { props: EditorInput["merchant"] } & Finish) {
  const merchant = useQuery(merchantQuery(props.id));
  if (props.id && merchant.isPending) {
    return <LoadingLine label="Loading the merchant." />;
  }
  if (merchant.isError) {
    return <LoadError label="The merchant did not load." onRetry={() => void merchant.refetch()} />;
  }
  return (
    <MerchantForm
      merchant={props.id ? (merchant.data ?? null) : null}
      initialName={props.name}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

export function MergeEditor({ props, onSaved }: { props: EditorInput["mergeMerchant"]; onSaved: (id: string) => void }) {
  const merchants = useMerchants();
  const merchant = useQuery(merchantQuery(props.merchantId));
  if (merchants.isPending || merchant.isPending) {
    return <LoadingLine label="Loading the merchant." />;
  }
  if (merchants.isError || merchant.isError || !merchants.data || !merchant.data) {
    return <LoadError label="The merchant did not load." onRetry={() => void merchant.refetch()} />;
  }
  return <MergeDialog source={merchant.data} merchants={merchants.data} onMerged={() => onSaved("ok")} />;
}
