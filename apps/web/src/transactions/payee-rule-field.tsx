import { normalizePayee, payeeCountSchema, ruleMatches, type RuleMatch } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/request";

const matchLabel: Record<RuleMatch, string> = {
  exact: "Exact",
  prefix: "Starts with",
  contains: "Contains",
};

type PayeeRuleFieldProps = {
  payee: string;
  exceptId: string | null;
  enabled: boolean;
  onEnabled: (enabled: boolean) => void;
  match: RuleMatch;
  onMatch: (match: RuleMatch) => void;
  pattern: string;
  onPattern: (pattern: string) => void;
};

export function PayeeRuleField({ payee, exceptId, enabled, onEnabled, match, onMatch, pattern, onPattern }: PayeeRuleFieldProps) {
  const normalized = normalizePayee(payee);
  const count = useQuery({
    queryKey: ["payee-count", normalized, exceptId],
    enabled: enabled && normalized.length > 0,
    queryFn: async () => {
      const params = new URLSearchParams({ payee: normalized });
      if (exceptId) {
        params.set("except", exceptId);
      }
      const result = await apiRequest(`/api/inbox/payee-count?${params.toString()}`, payeeCountSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.count;
    },
  });

  if (normalized.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-3">
      <Field orientation="horizontal">
        <Checkbox id="always-payee" checked={enabled} onCheckedChange={(value) => onEnabled(value === true)} />
        <FieldContent>
          <FieldLabel htmlFor="always-payee">Always do this for {normalized}</FieldLabel>
        </FieldContent>
      </Field>
      {enabled ? (
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <Field>
            <FieldLabel htmlFor="payee-match">Match</FieldLabel>
            <Select
              value={match}
              onValueChange={(value) => {
                if ((ruleMatches as readonly string[]).includes(value)) {
                  onMatch(value as RuleMatch);
                }
              }}
            >
              <SelectTrigger id="payee-match" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ruleMatches.map((item) => (
                  <SelectItem key={item} value={item}>
                    {matchLabel[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="payee-pattern">Pattern</FieldLabel>
            <Input id="payee-pattern" value={pattern} onChange={(event) => onPattern(event.target.value)} />
          </Field>
        </div>
      ) : null}
      {enabled && count.data ? <p className="text-sm text-muted-foreground">Also applies to {count.data} more.</p> : null}
    </div>
  );
}
