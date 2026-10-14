import { categoryForRefund } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { refundPurchasesQuery } from "@/api/transactions";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { refundPurchaseLabel } from "@/transactions/format";
import { OptionCombobox } from "@/transactions/option-combobox";

export function RefundOfField({
  id,
  asOf,
  payee,
  value,
  categoryName,
  merchantName,
  currency,
  linked,
  onChange,
  onCategory,
  onMerchant,
}: {
  id: string;
  asOf: string;
  payee: string;
  value: string | null;
  categoryName: string | null;
  merchantName: string | null;
  currency: string;
  linked: { id: string; date: string; amount: number; payeeRaw: string } | null;
  onChange: (id: string | null) => void;
  onCategory: (id: string | null) => void;
  onMerchant: (id: string | null) => void;
}) {
  const purchases = useQuery(refundPurchasesQuery(asOf, payee));
  const options = (purchases.data ?? []).map((item) => ({
    id: item.id,
    label: refundPurchaseLabel(currency, item.payeeRaw, item.date, item.amount),
  }));
  const withLinked =
    linked && value === linked.id && !options.some((option) => option.id === linked.id)
      ? [{ id: linked.id, label: refundPurchaseLabel(currency, linked.payeeRaw, linked.date, linked.amount) }, ...options]
      : options;
  return (
    <Field>
      <FieldLabel htmlFor={id}>Refund of…</FieldLabel>
      <OptionCombobox
        id={id}
        value={value}
        options={withLinked}
        placeholder="No purchase"
        emptyLabel="No purchase"
        preserveOrder
        onChange={(next) => {
          onChange(next);
          const item = purchases.data?.find((row) => row.id === next);
          if (item) {
            onCategory(categoryForRefund(item));
            onMerchant(item.merchantId);
          }
        }}
      />
      {value ? (
        <FieldDescription>
          {[categoryName ?? "No category", merchantName].filter((part) => part !== null).join(" · ")} (from the purchase)
        </FieldDescription>
      ) : null}
    </Field>
  );
}
