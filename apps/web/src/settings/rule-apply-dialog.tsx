import { currencyUpdateSchema, ruleApplyPreviewSchema, type Rule } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/request";
import { formatMoney } from "@/money";
import { formatDate } from "@/transactions/format";
import { ruleError } from "@/settings/format";

type RuleApplyDialogProps = {
  rule: Rule;
  onClose: () => void;
  onApplied: () => void;
};

export function RuleApplyDialog({ rule, onClose, onApplied }: RuleApplyDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const currency = useQuery({
    queryKey: ["book-currency"],
    queryFn: async () => {
      const result = await apiRequest("/api/settings/currency", currencyUpdateSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.currency;
    },
  });
  const preview = useQuery({
    queryKey: ["rule-preview", rule.id],
    queryFn: async () => {
      const result = await apiRequest(`/api/rules/${rule.id}/preview`, ruleApplyPreviewSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  async function apply() {
    setError(null);
    const result = await apiRequest(`/api/rules/${rule.id}/apply`, ruleApplyPreviewSchema, { method: "POST" });
    if (!result.ok) {
      setError(ruleError(result.code));
      return;
    }
    onApplied();
  }

  const count = preview.data?.count ?? 0;

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Apply this rule to existing transactions?</DialogTitle>
        <DialogDescription>
          {preview.isPending ? "Checking matching transactions." : `This rule would change ${count} ${count === 1 ? "transaction" : "transactions"}.`}
        </DialogDescription>
      </DialogHeader>
      {preview.isError ? <p>The preview did not load.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {preview.data && preview.data.sample.length > 0 ? (
        <ul className="grid gap-2 text-sm">
          {preview.data.sample.map((row) => (
            <li key={row.id}>
              {row.payeeRaw} · {formatDate(row.date)}
              {currency.data ? ` · ${formatMoney(currency.data, row.amount)}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={preview.isPending || preview.isError || count === 0} onClick={() => void apply()}>
          Apply to these transactions
        </Button>
      </DialogFooter>
    </div>
  );
}
