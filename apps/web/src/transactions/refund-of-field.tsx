import { categoryForRefund, refundPurchaseListSchema } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { Field, FieldLabel } from "@/components/ui/field";
import { refundPurchaseLabel } from "@/transactions/format";
import { apiRequest } from "@/request";
import { OptionCombobox } from "@/transactions/option-combobox";

export function RefundOfField({
  id,
  asOf,
  payee,
  merchantId,
  value,
  currency,
  linked,
  onChange,
  onCategory,
}: {
  id: string;
  asOf: string;
  payee: string;
  merchantId: string | null;
  value: string | null;
  currency: string;
  linked: { id: string; date: string; amount: number; payeeRaw: string } | null;
  onChange: (id: string | null) => void;
  onCategory: (id: string | null) => void;
}) {
  const purchases = useQuery({
    queryKey: ["refund-purchases", asOf, payee, merchantId],
    queryFn: async () => {
      const params = new URLSearchParams({ asOf });
      if (payee.trim().length > 0) {
        params.set("payee", payee);
      }
      if (merchantId) {
        params.set("merchantId", merchantId);
      }
      const result = await apiRequest(`/api/transactions/refund-purchases?${params.toString()}`, refundPurchaseListSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.items;
    },
  });
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
          }
        }}
      />
    </Field>
  );
}
