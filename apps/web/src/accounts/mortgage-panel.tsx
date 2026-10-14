import { milliPctToPercent, Temporal, toMinorUnits } from "@num/shared";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { DateField } from "@/components/date-field";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/money";

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
  const [extraText, setExtraText] = useState("");
  const [lumpText, setLumpText] = useState("");
  const [lumpDateText, setLumpDateText] = useState("");
  const [effect, setEffect] = useState({ extra: 0, lumpSum: 0, lumpDate: "" });
  const [extraError, setExtraError] = useState<string | null>(null);

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

  function readExtra(text: string) {
    if (text.trim().length === 0) {
      return 0;
    }
    try {
      const minor = toMinorUnits(currency, text.trim());
      if (minor < 0) {
        setExtraError("Enter the extra amount as a positive number.");
        return null;
      }
      return minor;
    } catch {
      setExtraError("Enter the extra amount as a number.");
      return null;
    }
  }

  function showExtra() {
    setExtraError(null);
    const perPayment = readExtra(extraText);
    const once = readExtra(lumpText);
    if (perPayment === null || once === null) {
      return;
    }
    if ((once > 0 && lumpDateText.length === 0) || (once === 0 && lumpDateText.length > 0)) {
      setExtraError("Enter the one-time extra and its date.");
      return;
    }
    setEffect({ extra: perPayment, lumpSum: once, lumpDate: lumpDateText });
  }

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
          Balance <Amount minor={row.balance} owed />
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
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="mortgage-extra">Extra on each payment</FieldLabel>
            <Input id="mortgage-extra" inputMode="decimal" autoComplete="off" value={extraText} onChange={(event) => setExtraText(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="mortgage-lump">One-time extra</FieldLabel>
            <Input id="mortgage-lump" inputMode="decimal" autoComplete="off" value={lumpText} onChange={(event) => setLumpText(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="mortgage-lump-date">Date of the one-time extra</FieldLabel>
            <DateField id="mortgage-lump-date" value={lumpDateText} onChange={setLumpDateText} />
          </Field>
          <Button type="button" variant="outline" className="self-end" onClick={showExtra}>Show the effect</Button>
        </div>
        {extraError ? <p className="text-sm">{extraError}</p> : null}
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
