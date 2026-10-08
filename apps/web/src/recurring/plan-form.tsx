import {
  fromMinorUnits,
  planCreateSchema,
  planSchema,
  planUpdateSchema,
  toMinorUnits,
  type Account,
  type AmountMode,
  type BusinessDayShift,
  type Category,
  type Merchant,
  type Plan,
  type PlanCreate,
  type PlanFrequency,
  type PlanKind,
  type PlanProposal,
} from "@num/shared";
import { ChevronRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { amountForForm, amountFromForm, kindLabel, planError } from "@/recurring/format";
import { OptionCombobox } from "@/transactions/option-combobox";
import { apiRequest } from "@/request";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export type PlanSeed = PlanProposal & { name: string; kind: PlanKind };
export type PlanDraft = Plan | PlanSeed | "new";

type PlanFormProps = {
  currency: string;
  draft: PlanDraft;
  accounts: Account[];
  categories: Category[];
  merchants: Merchant[];
  onClose: () => void;
  onSaved: (id: string) => void;
};

function isPlan(draft: PlanDraft): draft is Plan {
  return draft !== "new" && "id" in draft;
}

function monthValue(day: number | null | undefined): string {
  if (day === -1) {
    return "last";
  }
  if (day == null) {
    return "same";
  }
  return String(day);
}

export function PlanForm({ currency, draft, accounts, categories, merchants, onClose, onSaved }: PlanFormProps) {
  const current = isPlan(draft) ? draft : null;
  const seed = draft === "new" ? null : draft;
  const [name, setName] = useState(seed && "name" in seed ? seed.name : "");
  const [kind, setKind] = useState<PlanKind>(seed && "kind" in seed ? seed.kind : "bill");
  const [accountId, setAccountId] = useState<string | null>(seed?.accountId ?? null);
  const [transferAccountId, setTransferAccountId] = useState<string | null>(current?.transferAccountId ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(current?.categoryId ?? null);
  const [merchantId, setMerchantId] = useState<string | null>(seed && "merchantId" in seed ? seed.merchantId : null);
  const [amount, setAmount] = useState(seed ? amountForForm(currency, "kind" in seed ? seed.kind : "bill", seed.expectedAmount) : "");
  const [tolerance, setTolerance] = useState(seed ? fromMinorUnits(currency, seed.tolerance) : "0");
  const [amountMode, setAmountMode] = useState<AmountMode>(seed?.amountMode ?? "fixed");
  const [startDate, setStartDate] = useState(seed?.startDate ?? "");
  const [freq, setFreq] = useState<PlanFrequency>(seed?.freq ?? "monthly");
  const [interval, setInterval] = useState(String(seed?.interval ?? 1));
  const [monthDay, setMonthDay] = useState(monthValue(seed?.monthDay));
  const [shift, setShift] = useState<BusinessDayShift>(current?.businessDayShift ?? "none");
  const [endDate, setEndDate] = useState(current?.endDate ?? "");
  const [active, setActive] = useState(current?.active ?? true);
  const [fundsBuckets, setFundsBuckets] = useState(current?.fundsBuckets ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(Boolean(current?.merchantId || current?.categoryId || current?.endDate));

  const accountOptions = accounts.filter((item) => !item.archivedAt).map((item) => ({ id: item.id, label: item.name }));
  const categoryOptions = categories
    .filter((item) => !item.archivedAt && item.kind === (kind === "income" ? "income" : "expense"))
    .map((item) => ({ id: item.id, label: item.name }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!accountId) {
      setError("Choose an account.");
      return;
    }
    let expectedAmount = 0;
    let toleranceAmount = 0;
    try {
      expectedAmount = amountFromForm(kind, toMinorUnits(currency, amount.trim()));
      toleranceAmount = Math.abs(toMinorUnits(currency, tolerance.trim() || "0"));
    } catch {
      setError("Enter the amount as a number.");
      return;
    }
    const every = Number(interval);
    if (!Number.isInteger(every) || every < 1) {
      setError("Enter how often this repeats as a whole number.");
      return;
    }
    const body: PlanCreate = {
      name: name.trim(),
      kind,
      accountId,
      expectedAmount,
      tolerance: toleranceAmount,
      amountMode,
      categoryId: kind === "transfer" ? null : categoryId,
      transferAccountId: kind === "transfer" ? transferAccountId : null,
      merchantId,
      startDate,
      freq,
      interval: every,
      monthDay: freq === "weekly" ? null : monthDay === "last" ? -1 : monthDay === "same" ? null : Number(monthDay),
      businessDayShift: shift,
      endDate: endDate.trim().length > 0 ? endDate : null,
      active,
      fundsBuckets: kind === "income" ? fundsBuckets : false,
    };
    const parsed = (current ? planUpdateSchema : planCreateSchema).safeParse(body);
    if (!parsed.success) {
      setError("Check the plan details and try again.");
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest(current ? `/api/recurring/${current.id}` : "/api/recurring", planSchema, {
        method: current ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!result.ok) {
        setError(planError(result.code));
        return;
      }
      onSaved(result.data.id);
    } catch {
      setError("The plan did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{current ? "Edit plan" : "New plan"}</DialogTitle>
        <DialogDescription>
          {current ? "Change what you expect and when." : "Add a payment or deposit you expect on a schedule."}
        </DialogDescription>
      </DialogHeader>
      <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
        <Field>
          <FieldLabel htmlFor="plan-name">Name</FieldLabel>
          <Input id="plan-name" value={name} required onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="plan-kind-field">Kind</FieldLabel>
          <Select value={kind} onValueChange={(value) => setKind(value as PlanKind)}>
            <SelectTrigger id="plan-kind-field" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["income", "bill", "transfer"] as const).map((item) => (
                <SelectItem key={item} value={item}>
                  {kindLabel(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="plan-account-field">Account</FieldLabel>
          <OptionCombobox id="plan-account-field" value={accountId} options={accountOptions} placeholder="Choose an account" onChange={setAccountId} />
        </Field>
        {kind === "transfer" ? (
          <Field>
            <FieldLabel htmlFor="plan-transfer">Other account</FieldLabel>
            <OptionCombobox
              id="plan-transfer"
              value={transferAccountId}
              options={accountOptions.filter((item) => item.id !== accountId)}
              placeholder="Choose an account"
              onChange={setTransferAccountId}
            />
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="plan-amount">Amount</FieldLabel>
          <Input id="plan-amount" inputMode="decimal" value={amount} required onChange={(event) => setAmount(event.target.value)} />
          <FieldDescription>
            {kind === "transfer" ? "Use a minus sign when money leaves this account." : "Enter the amount you expect."}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="plan-mode">Amount changes</FieldLabel>
          <Select value={amountMode} onValueChange={(value) => setAmountMode(value as AmountMode)}>
            <SelectTrigger id="plan-mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Same amount each time</SelectItem>
              <SelectItem value="variable">Amount changes each time</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="plan-start">Starts</FieldLabel>
            <Input id="plan-start" type="date" value={startDate} required onChange={(event) => setStartDate(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="plan-every">Every</FieldLabel>
            <Input id="plan-every" inputMode="numeric" value={interval} required onChange={(event) => setInterval(event.target.value)} />
            <FieldDescription>2 with weekly means every two weeks.</FieldDescription>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="plan-freq">Repeats</FieldLabel>
          <Select value={freq} onValueChange={(value) => setFreq(value as PlanFrequency)}>
            <SelectTrigger id="plan-freq" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {freq === "weekly" ? null : (
          <Field>
            <FieldLabel htmlFor="plan-day">Day of the month</FieldLabel>
            <Select value={monthDay} onValueChange={setMonthDay}>
              <SelectTrigger id="plan-day" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="same">Same day as the start date</SelectItem>
                <SelectItem value="last">Last day of the month</SelectItem>
                {Array.from({ length: 31 }, (_, index) => (
                  <SelectItem key={index + 1} value={String(index + 1)}>
                    {index + 1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field orientation="horizontal">
          <Switch id="plan-active" checked={active} onCheckedChange={setActive} />
          <FieldLabel htmlFor="plan-active">Active</FieldLabel>
        </Field>
        <Collapsible open={more} onOpenChange={setMore}>
          <CollapsibleTrigger className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">
            <ChevronRight className={`size-4 transition-transform ${more ? "rotate-90" : ""}`} aria-hidden="true" />
            More options: merchant, category, end date
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-4 pt-3">
            {kind === "transfer" ? null : (
              <Field>
                <FieldLabel htmlFor="plan-category">Category</FieldLabel>
                <OptionCombobox
                  id="plan-category"
                  value={categoryId}
                  options={categoryOptions}
                  placeholder="No category"
                  emptyLabel="No category"
                  onChange={setCategoryId}
                />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="plan-merchant">Merchant</FieldLabel>
              <OptionCombobox
                id="plan-merchant"
                value={merchantId}
                options={merchants.map((item) => ({ id: item.id, label: item.name }))}
                placeholder="Any merchant"
                emptyLabel="Any merchant"
                onChange={setMerchantId}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="plan-tolerance">Match within</FieldLabel>
              <Input id="plan-tolerance" inputMode="decimal" value={tolerance} onChange={(event) => setTolerance(event.target.value)} />
              <FieldDescription>How far the amount can be and still match.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="plan-shift">Weekend</FieldLabel>
              <Select value={shift} onValueChange={(value) => setShift(value as BusinessDayShift)}>
                <SelectTrigger id="plan-shift" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Keep the date</SelectItem>
                  <SelectItem value="next">Move to the next weekday</SelectItem>
                  <SelectItem value="previous">Move to the previous weekday</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="plan-end">Ends</FieldLabel>
              <Input id="plan-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </Field>
            {kind === "income" ? (
              <Field orientation="horizontal">
                <Switch id="plan-funds" checked={fundsBuckets} onCheckedChange={setFundsBuckets} />
                <FieldLabel htmlFor="plan-funds">This paycheck funds buckets</FieldLabel>
              </Field>
            ) : null}
          </CollapsibleContent>
        </Collapsible>
        {error ? <FieldError>{error}</FieldError> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving plan" : current ? "Save plan" : "Add plan"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
