import { categoryForRefund } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useDeferredValue } from "react";
import { refundPurchasesQuery } from "@/api/transactions";
import { Boundary } from "@/components/boundary";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { useBookCurrency, useCategoryNames, useMerchantNames } from "@/editors/lookups";
import { refundPurchaseLabel } from "@/transactions/format";
import { OptionCombobox } from "@/transactions/option-combobox";

type RefundOfProps = {
  id: string;
  /** The date of the refund. */
  date: string;
  payee: string;
  value: string | null;
  categoryId: string | null;
  merchantId: string | null;
  linked: { id: string; date: string; amount: number; payeeRaw: string } | null;
  onChange: (id: string | null) => void;
  onCategory: (id: string | null) => void;
  onMerchant: (id: string | null) => void;
};

export function RefundOfField(props: RefundOfProps) {
  return (
    <Boundary look="panel" loading="Loading the purchases." failed="The purchases did not load.">
      <RefundOf {...props} />
    </Boundary>
  );
}

function RefundOf({ id, date, payee, value, categoryId, merchantId, linked, onChange, onCategory, onMerchant }: RefundOfProps) {
  const currency = useBookCurrency();
  const categoryName = useCategoryNames().get(categoryId ?? "");
  const merchantName = useMerchantNames().get(merchantId ?? "");
  // The purchases on the screen stay while the purchases for a new payee text load.
  const { data: purchases } = useSuspenseQuery(refundPurchasesQuery(date, useDeferredValue(payee)));
  const options = purchases.map((item) => ({
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
          const item = purchases.find((row) => row.id === next);
          if (item) {
            onCategory(categoryForRefund(item));
            onMerchant(item.merchantId);
          }
        }}
      />
      {value ? (
        <FieldDescription>
          {[categoryName ?? "No category", merchantName].filter((part) => part !== undefined).join(" · ")} (from the purchase)
        </FieldDescription>
      ) : null}
    </Field>
  );
}
