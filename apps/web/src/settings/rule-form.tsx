import { ruleMatches, ruleSchema, type Account, type Category, type Merchant, type Rule, type RuleMatch } from "@num/shared";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OptionCombobox } from "@/transactions/option-combobox";
import { apiRequest } from "@/request";
import { ruleError } from "@/settings/format";

const matchLabels: Record<RuleMatch, string> = {
  exact: "Exact",
  prefix: "Starts with",
  contains: "Contains",
  regex: "Regular expression",
};

type RuleFormProps = {
  rule: Rule | null;
  accounts: Account[];
  categories: Category[];
  merchants: Merchant[];
  onClose: () => void;
  onSaved: () => void;
};

function isMatch(value: string): value is RuleMatch {
  return (ruleMatches as readonly string[]).includes(value);
}

export function RuleForm({ rule, accounts, categories, merchants, onClose, onSaved }: RuleFormProps) {
  const [match, setMatch] = useState<RuleMatch>(rule?.match ?? "exact");
  const [pattern, setPattern] = useState(rule?.pattern ?? "");
  const [priority, setPriority] = useState(String(rule?.priority ?? 0));
  const [accountId, setAccountId] = useState<string | null>(rule?.accountId ?? null);
  const [merchantId, setMerchantId] = useState<string | null>(rule?.merchantId ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(rule?.categoryId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pattern.trim().length === 0) {
      setError("Enter a pattern.");
      return;
    }
    if (!merchantId && !categoryId) {
      setError("Choose a merchant, a category, or both.");
      return;
    }
    const priorityNumber = Number(priority);
    if (!Number.isInteger(priorityNumber)) {
      setError("Enter a whole number for the priority.");
      return;
    }
    setSaving(true);
    const result = await apiRequest(rule ? `/api/rules/${rule.id}` : "/api/rules", ruleSchema, {
      method: rule ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        match,
        pattern: pattern.trim(),
        priority: priorityNumber,
        accountId,
        merchantId,
        categoryId,
      }),
    });
    setSaving(false);
    if (!result.ok) {
      setError(ruleError(result.code));
      return;
    }
    onSaved();
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{rule ? "Edit rule" : "New rule"}</DialogTitle>
        <DialogDescription>The pattern is compared with the normalized payee.</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="rule-match">Match</FieldLabel>
        <Select
          value={match}
          onValueChange={(value) => {
            if (isMatch(value)) {
              setMatch(value);
            }
          }}
        >
          <SelectTrigger id="rule-match" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ruleMatches.map((item) => (
              <SelectItem key={item} value={item}>
                {matchLabels[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field data-invalid={error !== null || undefined}>
        <FieldLabel htmlFor="rule-pattern">Pattern</FieldLabel>
        <Input id="rule-pattern" value={pattern} onChange={(event) => setPattern(event.target.value)} />
        <FieldDescription>
          {match === "regex"
            ? "Use a regular expression for the normalized payee."
            : "The app compares this text with the normalized payee."}
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="rule-priority">Priority</FieldLabel>
        <Input id="rule-priority" inputMode="numeric" value={priority} onChange={(event) => setPriority(event.target.value)} />
        <FieldDescription>A higher number wins. A rule for one account wins over a rule for every account.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="rule-account">Account</FieldLabel>
        <OptionCombobox
          id="rule-account"
          value={accountId}
          options={accounts.map((account) => ({ id: account.id, label: account.name }))}
          placeholder="Every account"
          emptyLabel="Every account"
          onChange={setAccountId}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="rule-merchant">Merchant</FieldLabel>
        <OptionCombobox
          id="rule-merchant"
          value={merchantId}
          options={merchants.map((item) => ({ id: item.id, label: item.name }))}
          placeholder="No merchant"
          emptyLabel="No merchant"
          onChange={setMerchantId}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="rule-category">Category</FieldLabel>
        <OptionCombobox
          id="rule-category"
          value={categoryId}
          options={categories.map((item) => ({ id: item.id, label: item.name }))}
          placeholder="No category"
          emptyLabel="No category"
          onChange={setCategoryId}
        />
      </Field>
      {error ? <FieldError>{error}</FieldError> : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving" : rule ? "Save rule" : "Add rule"}
        </Button>
      </DialogFooter>
    </form>
  );
}
