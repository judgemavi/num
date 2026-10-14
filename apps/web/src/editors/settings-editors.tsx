import { usePrefetchQuery, useSuspenseQuery } from "@tanstack/react-query";
import { categoryQuery, groupQuery } from "@/api/categories";
import { merchantQuery } from "@/api/merchants";
import { inboxDecisionsQuery } from "@/api/review";
import { tagQuery } from "@/api/tags";
import type { EditorInput } from "@/editors/editor-types";
import { CategoryForm } from "@/settings/category-form";
import { GroupForm } from "@/settings/group-form";
import { MerchantForm } from "@/settings/merchant-form";
import { MergeDialog } from "@/settings/merge-dialog";
import { TagForm } from "@/settings/tag-form";

export function CategoryEditor({ id, name, kind }: EditorInput["category"]) {
  if (id === null) {
    return <CategoryForm category={null} initialName={name} initialKind={kind} />;
  }
  return <SavedCategory id={id} />;
}

function SavedCategory({ id }: { id: string }) {
  const { data: category } = useSuspenseQuery(categoryQuery(id));
  return <CategoryForm category={category} />;
}

export function GroupEditor({ id, name }: EditorInput["group"]) {
  if (id === null) {
    return <GroupForm id={null} initialName={name ?? ""} />;
  }
  return <SavedGroup id={id} />;
}

function SavedGroup({ id }: { id: string }) {
  const { data: group } = useSuspenseQuery(groupQuery(id));
  return <GroupForm id={id} initialName={group.name} />;
}

export function TagEditor({ id, name }: EditorInput["tag"]) {
  if (id === null) {
    return <TagForm id={null} initialName={name ?? ""} />;
  }
  return <SavedTag id={id} />;
}

function SavedTag({ id }: { id: string }) {
  const { data: tag } = useSuspenseQuery(tagQuery(id));
  return <TagForm id={id} initialName={tag.name} />;
}

export function MerchantEditor({ id, name }: EditorInput["merchant"]) {
  if (id === null) {
    return <MerchantForm merchant={null} initialName={name} />;
  }
  return <SavedMerchant id={id} />;
}

function SavedMerchant({ id }: { id: string }) {
  // The form shows the saved answers for the merchant. Their read starts here, thus it does not wait for the merchant.
  usePrefetchQuery(inboxDecisionsQuery());
  const { data: merchant } = useSuspenseQuery(merchantQuery(id));
  return <MerchantForm merchant={merchant} />;
}

export function MergeEditor({ merchantId }: EditorInput["mergeMerchant"]) {
  const { data: merchant } = useSuspenseQuery(merchantQuery(merchantId));
  return <MergeDialog source={merchant} />;
}
