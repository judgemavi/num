import { milliPctToPercent, Temporal, parseAmount } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
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
import { formatMoney } from "@/money";

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
function readExtra(currency: string, value: { extra: string; lump: string; lumpDate: string }) {
  const extra = readAmount(currency, value.extra);
  const lumpSum = readAmount(currency, value.lump);
  if (extra === null || lumpSum === null) {
    return { error: "Enter the extra amount as a number." };
  }
  if (extra < 0 || lumpSum < 0) {
    return { error: "Enter the extra amount as a positive number." };
  }
  if ((lumpSum > 0) !== (value.lumpDate.length > 0)) {
    return { error: "Enter the one-time extra and its date." };
  }
  return { effect: { extra, lumpSum, lumpDate: value.lumpDate } };
}

function formatDay(iso: string) {
  return Temporal.PlainDate.from(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
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
  // The extra amounts of the schedule on the screen. The form gives new amounts when the person asks for the effect.
  const [effect, setEffect] = useState({ extra: 0, lumpSum: 0, lumpDate: "" });
  const form = useAppForm({
    defaultValues: { extra: "", lump: "", lumpDate: "" },
    validators: {
      onSubmit: ({ value }) => {
        const extra = readExtra(currency, value);
        return extra.error;
      },
    },
    onSubmit: ({ value }) => {
      const extra = readExtra(currency, value);
      if (extra.effect) {
        setEffect(extra.effect);
      }
    },
  });

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
          <Button type="button" onClick={openTerms}>Add mortgage terms</Button>
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
          <Button type="button" variant="outline" onClick={openTerms}>Mortgage terms</Button>
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
          <div className="grid gap-3 sm:grid-cols-2">
            <form.AppField name="extra">{(field) => <field.MoneyField id="mortgage-extra" label="Extra on each payment" />}</form.AppField>
            <form.AppField name="lump">{(field) => <field.MoneyField id="mortgage-lump" label="One-time extra" />}</form.AppField>
            <form.AppField name="lumpDate">{(field) => <field.DateInputField id="mortgage-lump-date" label="Date of the one-time extra" />}</form.AppField>
            <Button type="button" variant="outline" className="self-end" onClick={() => void form.handleSubmit()}>
              Show the effect
            </Button>
          </div>
          <form.FormError />
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
