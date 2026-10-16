import { fieldValue } from "@/forms/form-values";
import { requestError } from "@/buckets/format";
import type { OverspentBucket } from "@num/shared";
import { useOverspent } from "@/buckets/use-overspent";
import { useCoverBucket } from "@/api/buckets";
import { localAsOf } from "@/as-of";
import { Amount } from "@/components/amount";
import { SidePanel } from "@/components/side-panel";
import { useActiveBuckets } from "@/editors/lookups";
import { useAppForm } from "@/forms/form-hook";

/**
 * The buckets that stay below zero after the fill, and the control that covers each one with money from a second
 * bucket. The fill covers a negative bucket from Unassigned, thus the panel shows only what Unassigned could not
 * cover.
 */
export function OverspentPanel() {
  const items = useOverspent();
  if (items.length === 0) {
    return null;
  }
  return (
    <SidePanel title="Overspent" text="Unassigned could not cover these buckets. Move money from another bucket, or release money from a bucket to Unassigned.">
      {items.map((item) => (
        <CoverRow key={item.id} item={item} />
      ))}
    </SidePanel>
  );
}

/** One overspent bucket. The row does its own write. A cover that fails shows an error toast. */
function CoverRow({ item }: { item: OverspentBucket }) {
  const cover = useCoverBucket();
  const need = -item.balance;
  const options = useActiveBuckets().items.filter((bucket) => bucket.id !== item.id && bucket.balance >= need);
  const form = useAppForm({
    defaultValues: { fromBucketId: fieldValue<string | null>(null) },
    validators: { onSubmit: ({ value }) => value.fromBucketId ? undefined : "Choose a bucket." },
    onSubmit: async ({ value, formApi }) => {
      if (!value.fromBucketId) return;
      try {
        await cover.mutateAsync({ id: item.id, body: { fromBucketId: value.fromBucketId, date: localAsOf() } });
      } catch (error) {
        formApi.setErrorMap({ onSubmit: { form: requestError(error, "The money did not move. Try again."), fields: {} } });
      }
    },
  });
  return (
    <div className="grid gap-2 border-t pt-3 first:border-t-0 first:pt-0">
      <p className="font-semibold">
        {item.name}
        <span className="mt-0.5 block text-sm font-normal text-attn">
          Over by <Amount value={need} />
        </span>
      </p>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">No other bucket has enough to cover this.</p>
      ) : (
        <form.AppForm>
          <form.FormShell className="grid gap-2">
            <form.AppField name="fromBucketId">{(field) => (
              <field.SelectField id={`cover-${item.id}`} label={`Cover ${item.name} from`} placeholder="Cover from" options={options.map((bucket) => ({ value: bucket.id, label: bucket.name }))} />
            )}</form.AppField>
            <form.FormError />
            <form.SubmitButton>Cover</form.SubmitButton>
          </form.FormShell>
        </form.AppForm>
      )}
    </div>
  );
}
