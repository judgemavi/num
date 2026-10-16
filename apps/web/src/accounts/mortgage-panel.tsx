import { formatCalendarDate } from "@/date-format";
import { milliPctToPercent, parseAmount } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useDeferredValue } from "react";
import { useStore } from "@tanstack/react-form";
import { mortgageViewQuery } from "@/api/mortgage";
import { frequencyLabels } from "@/accounts/mortgage-format";
import { MortgageSchedule } from "@/accounts/mortgage-schedule";
import { useEditors } from "@/editors/editor-api";
import { useBookCurrency } from "@/editors/lookups";
import { localAsOf } from "@/as-of";
import { Amount } from "@/components/amount";
import { Boundary } from "@/components/boundary";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppForm } from "@/forms/form-hook";
import { decimalsError, formatMoney } from "@/money";

function readAmount(currency: string, text: string) {
  if (text.trim().length === 0) {
    return 0;
  }
  try {
    return parseAmount(currency, text.trim());
  } catch {
    return null;
  }
}

/** The extra amounts of the form for the schedule, or the text of the error. */
function readExtra(currency: string, value: { lump: string; lumpDate: string }) {
  const lumpSum = readAmount(currency, value.lump);
  if (lumpSum === null) {
    return { error: decimalsError(currency, value.lump) ?? "Enter the extra amount as a number." };
  }
  if (lumpSum < 0) {
    return { error: "Enter the extra amount as a positive number." };
  }
  if ((lumpSum > 0) !== (value.lumpDate.length > 0)) {
    return { error: "Enter the one-time extra and its date." };
  }
  return { effect: { extra: 0, lumpSum, lumpDate: value.lumpDate } };
}

function formatDay(iso: string) {
  return formatCalendarDate(iso, { month: "short", day: "numeric", year: "numeric" });
}

export function MortgagePanel({ accountId }: { accountId: string }) {
  return (
    <Boundary loading="Loading the mortgage." failed="The mortgage did not load.">
      <MortgageView accountId={accountId} />
    </Boundary>
  );
}

function MortgageView({ accountId }: { accountId: string }) {
  const { openEditor } = useEditors();
  const currency = useBookCurrency();
  const form = useAppForm({
    defaultValues: { lump: "", lumpDate: "", effect: { extra: 0, lumpSum: 0, lumpDate: "" } },
    validators: {
      onSubmit: ({ value }) => {
        const extra = readExtra(currency, value);
        return extra.error;
      },
    },
    onSubmit: ({ value, formApi }) => {
      const extra = readExtra(currency, value);
      if (extra.effect) {
        formApi.setFieldValue("effect", extra.effect, { dontUpdateMeta: true });
      }
    },
  });

  const effect = useStore(form.store, (state) => state.values.effect);

  // The schedule on the screen stays while the schedule with a new extra amount loads.
  const { data: row } = useSuspenseQuery(mortgageViewQuery(accountId, localAsOf(), useDeferredValue(effect)));

  function openTerms() {
    void openEditor("account", { id: accountId });
  }

  if (!row) {
    return (
      <Card>
        <CardHeader className="px-5 pt-5 pb-0">
          <CardTitle>Mortgage</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pt-4 pb-5">
          <Button type="button" onClick={openTerms}>Add</Button>
        </CardContent>
      </Card>
    );
  }

  const rate = `${milliPctToPercent(row.rateMilliPct)}%`;

  return (
    <Card>
      <CardHeader className="px-5 pt-5 pb-0">
        <CardTitle>Mortgage</CardTitle>
        <CardAction>
          <Button type="button" variant="outline" onClick={openTerms}>Edit</Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4 px-5 pt-4 pb-5">
        <p className="text-sm">
          Balance <Amount value={row.balance} owed />
          <span className="text-muted-foreground"> · {rate} · {frequencyLabels[row.paymentFrequency]}</span>
        </p>
        {row.payoffDate ? (
          <p className="text-sm">
            Payoff date {formatDay(row.payoffDate)}
            {row.payoffDate > row.termEnd ? <span className="text-muted-foreground">. This date uses the current rate after the term ends on {formatDay(row.termEnd)}.</span> : null}
          </p>
        ) : row.nonAmortizing ? (
          <p className="text-sm" role="alert">This payment does not cover the interest. Check the payment, rate and amount owed.</p>
        ) : (
          <p className="text-sm">This payment does not pay off the loan.</p>
        )}
        <MortgageSchedule payments={row.payments} actuals={row.actualPayments} />
        <form.AppForm>
          <form.FormShell className="grid gap-3 sm:grid-cols-2">
            <form.AppField name="lump">{(field) => <field.MoneyField id="mortgage-lump" label="One-time extra" />}</form.AppField>
            <form.AppField name="lumpDate">{(field) => <field.DateInputField id="mortgage-lump-date" label="Date of the one-time extra" />}</form.AppField>
            <form.SubmitButton>
              Show the effect
            </form.SubmitButton>
            <form.FormError />
          </form.FormShell>
        </form.AppForm>
        {row.extra ? (
          <p className="text-sm" role="status">
            {row.extra.payoffDate ? `New payoff date ${formatDay(row.extra.payoffDate)}.` : "The loan does not pay off with this extra amount."}
            {row.extra.interestSaved !== null ? ` Interest saved ${formatMoney(currency, row.extra.interestSaved)}.` : ""}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
